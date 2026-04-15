'use client';

/**
 * Shared booking data layer: stale-time caching + in-flight request deduplication.
 *
 * Module-level singletons survive across component remounts and are shared between
 * all booking entry points (BookingModal, CalendarModal, ExperienceCalendarSection,
 * BookingPageClient).
 *
 * Two layers of optimization:
 * 1. Stale-time cache – resolved responses are reused for up to STALE_MS[type].
 * 2. In-flight dedup – concurrent calls for the same key attach to one fetch instead
 *    of firing N parallel requests.
 *
 * Abort handling: each caller may pass an AbortSignal so state updates are skipped when a
 * component unmounts or deps change. The in-flight dedup layer applies a bounded timeout
 * (see `FETCH_TIMEOUT_MS`) so a stalled network request cannot block subsequent callers;
 * when the timeout fires the in-flight entry is cleared and the promise rejects — the
 * underlying `fetch` is intentionally not aborted so a late response can still populate
 * the cache for a later read.
 *
 * Production: when NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL) is set and valid and
 * matches the current origin, API requests use it; otherwise the cache falls back to
 * same-origin and logs a guarded warning so misconfiguration is diagnosable. Public
 * availability requests use credentials only for same-origin to avoid cross-origin issues.
 */

/** Avoid spamming the console: getApiBaseUrl runs on every fetch; mismatch is common on Netlify branch URLs. */
const siteUrlWarnOnce = new Set<string>();

function warnSiteUrlOnce(key: string, log: () => void) {
  if (siteUrlWarnOnce.has(key)) return;
  siteUrlWarnOnce.add(key);
  log();
}

/**
 * Returns the base URL for API requests. Validates env-provided URL; falls back to
 * same-origin when invalid or when origin does not match the current page (avoids
 * wrong production value breaking availability requests). Logs once per session when
 * an override is rejected (not on every API call).
 */
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const isLocal =
    origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  if (isLocal) return origin;

  const fromEnv =
    (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!fromEnv) return origin;

  const normalized = fromEnv.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      warnSiteUrlOnce("invalid", () =>
        console.warn(
          "[booking-data-cache] NEXT_PUBLIC_SITE_URL (or APP_URL) is not a valid URL; using same-origin.",
          { value: fromEnv },
        ),
      );
    }
    return origin;
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      warnSiteUrlOnce("protocol", () =>
        console.warn(
          "[booking-data-cache] NEXT_PUBLIC_SITE_URL must be http or https; using same-origin.",
          { value: fromEnv },
        ),
      );
    }
    return origin;
  }
  const envOrigin = parsed.origin;
  if (envOrigin !== origin) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      warnSiteUrlOnce(`origin:${envOrigin}->${origin}`, () =>
        console.warn(
          "[booking-data-cache] NEXT_PUBLIC_SITE_URL origin does not match this page; using same-origin for API calls. " +
            "For Netlify previews, set NEXT_PUBLIC_SITE_URL to the preview URL, use DEPLOY_PRIME_URL, or leave unset.",
          { envOrigin, currentOrigin: origin, value: fromEnv },
        ),
      );
    }
    return origin;
  }
  return envOrigin;
}

/** Exported for UI copy: client calendar hints may lag this long behind server truth. */
export const STALE_MS_SLOTS = 1_500;

const STALE_MS = {
  experiences: 60_000,
  /** Short TTL for high-traffic windows; create-hold is authoritative for conflicts. */
  slots: STALE_MS_SLOTS,
  /** Shorter TTL for ticketed experiences so departure/slot config changes are picked up quickly. */
  slotsTicketed: 1_000,
  /** Same short TTL as slots so calendar prices refresh with availability/slot cache bumps. */
  datePrices: STALE_MS_SLOTS,
  experienceDetail: 60_000,
  experienceBySlug: 60_000,
  experienceRates: 3_600_000, // 1 h — aligns with CDN s-maxage; rates static within a session
  boats: 60_000,
} as const;

const FETCH_TIMEOUT_MS = 20_000;

const SLOT_CACHE_VERSION_KEY = "bb_slot_cache_version";
const SLOT_CACHE_BROADCAST_CHANNEL = "bb_slot_cache_invalidation";
let slotInvalidationBroadcast: BroadcastChannel | null = null;

/** Returns a cache-bust version so slot/date-price fetches bypass in-memory cache across tabs after a booking. */
function getSlotCacheVersion(): string {
  if (typeof window === "undefined") return "0";
  try {
    return localStorage.getItem(SLOT_CACHE_VERSION_KEY) ?? "0";
  } catch {
    return "0";
  }
}

/** Bump slot/date-price cache version so next fetch in any tab uses a new key and refetches. */
function setSlotCacheVersion(): void {
  if (typeof window === "undefined") return;
  const nextVersion = String(Date.now());
  try {
    localStorage.setItem(SLOT_CACHE_VERSION_KEY, nextVersion);
  } catch {
    // ignore
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      if (!slotInvalidationBroadcast) {
        slotInvalidationBroadcast = new BroadcastChannel(SLOT_CACHE_BROADCAST_CHANNEL);
      }
      slotInvalidationBroadcast.postMessage({ key: SLOT_CACHE_VERSION_KEY, version: nextVersion });
    }
  } catch {
    // fallback remains storage event
  }
}

/** Maximum number of resolved entries kept in memory at once. Oldest is evicted when exceeded. */
const MAX_CACHE_SIZE = 120;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  /** Server timestamp (ms) when the response was generated, if provided. */
  serverGeneratedAt?: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function evictOldestIfNeeded(): void {
  if (dataCache.size <= MAX_CACHE_SIZE) return;
  // Map iteration order is insertion order, so the first key is the oldest.
  const firstKey = dataCache.keys().next().value;
  if (firstKey !== undefined) dataCache.delete(firstKey);
}

/**
 * Cached GET with stale-while-revalidate and in-flight deduplication.
 * The underlying fetch is not tied to the caller's AbortSignal so late responses can still
 * warm the cache; callers that pass `signal` only skip applying the result when aborted.
 * A shared timeout clears stuck `inFlight` entries without aborting the fetch (see module header).
 */
function fetchCached<T>(
  key: string,
  url: string,
  staleMs: number,
  signal?: AbortSignal,
  /** Use `default` for CDN-friendly routes (e.g. `/api/experiences`); default `no-store` for availability. */
  fetchCache: RequestCache = "no-store",
): Promise<T> {
  if (typeof window === "undefined") {
    return fetch(url, { cache: fetchCache }).then((r) => r.json() as Promise<T>);
  }
  if (signal?.aborted) return Promise.reject(new DOMException("", "AbortError"));

  const cached = dataCache.get(key);
  if (
    cached &&
    Date.now() - cached.fetchedAt < staleMs &&
    (cached.serverGeneratedAt == null || Date.now() - cached.serverGeneratedAt < STALE_MS_SLOTS)
  ) {
    return Promise.resolve(cached.data as T);
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;

  const basePromise: Promise<T> =
    existing ??
    (() => {
      const base = getApiBaseUrl();
      const fullUrl = base ? `${base}${url}` : url;
      // Same-origin: use credentials. Cross-origin: omit to avoid forcing credentialed CORS for public availability.
      const isSameOrigin =
        typeof window !== "undefined" && (!base || base === window.location.origin);
      const fetchOpts: RequestInit = {
        credentials: isSameOrigin ? "include" : "omit",
        cache: fetchCache,
      };
      // Run without signal so the response is always cached even when a caller
      // aborts early. Per-caller abort is handled by the wrapper below.
      const startMs = Date.now();
      const rawFetchPromise = fetch(fullUrl, fetchOpts);
      let serverGeneratedAtMs: number | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let p!: Promise<T>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          if (inFlight.get(key) === p) {
            inFlight.delete(key);
            const err = new Error("Request timed out");
            (err as Error & { name?: string }).name = "TimeoutError";
            reject(err);
          }
        }, FETCH_TIMEOUT_MS);
      });
      p = Promise.race([rawFetchPromise, timeoutPromise])
        .finally(() => {
          if (timeoutId != null) clearTimeout(timeoutId);
        })
        .then(async (res) => {
          if (!res.ok) {
            let body: { error?: string; hint?: string; code?: string } = {};
            try {
              body = (await res.json()) as typeof body;
            } catch {
              // ignore
            }
            const e = new Error(body.error ?? `HTTP ${res.status}`) as Error & { apiBody?: typeof body; status?: number };
            e.apiBody = body;
            (e as Error & { status?: number }).status = res.status;
            throw e;
          }
          const data = (await res.json()) as T;
          const partialHeader = res.headers.get("X-Slots-Partial-Data") === "true";
          const unresolvedHeader = res.headers.get("X-Unresolved-Booking-Count");
          const generatedAtHeader = res.headers.get("X-Slots-Generated-At");
          serverGeneratedAtMs = (() => {
            if (!generatedAtHeader) return null;
            const ms = new Date(generatedAtHeader).getTime();
            return Number.isFinite(ms) ? ms : null;
          })();
          const partialBody =
            data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            (data as { partialData?: boolean }).partialData === true;
          const partialData = partialHeader || partialBody;
          if (data && typeof data === "object" && !Array.isArray(data)) {
            const o = data as T & { partialData?: boolean; unresolvedBookingCount?: number };
            if (partialData) o.partialData = true;
            const ur = unresolvedHeader != null && unresolvedHeader !== "" ? Number(unresolvedHeader) : 0;
            if (Number.isFinite(ur) && ur > 0) o.unresolvedBookingCount = ur;
          }
          return data;
        })
        .then((data) => {
          dataCache.delete(key); // remove then re-insert to update insertion order (LRU)
          dataCache.set(key, {
            data,
            fetchedAt: Date.now(),
            ...(typeof serverGeneratedAtMs === "number" ? { serverGeneratedAt: serverGeneratedAtMs } : {}),
          });
          evictOldestIfNeeded();
          if (inFlight.get(key) === p) inFlight.delete(key);
          return data;
        })
        .catch((err: unknown) => {
          if (inFlight.get(key) === p) inFlight.delete(key);
          const durationMs = Date.now() - startMs;
          const isAbort = (err as { name?: string })?.name === "AbortError";
          if (isAbort) throw err;
          const isTimeout = (err as { name?: string })?.name === "TimeoutError";
          if (isTimeout) {
            console.error("[booking] API request timed out (in-flight dedup cleared)", { key, url, durationMs });
            throw err;
          }
          // Always log failed API requests to dev console (HTTP errors and network/timeout failures).
          const status = (err as { status?: number }).status;
          const apiBody = (err as { apiBody?: { error?: string; hint?: string; firebaseDetail?: { summary?: string } } }).apiBody;
          if (typeof status === "number" && status >= 400) {
            console.error("[booking] API request failed (HTTP)", {
              key,
              url,
              status,
              durationMs,
              error: apiBody?.error,
              hint: apiBody?.hint,
              firebaseSummary: apiBody?.firebaseDetail?.summary,
            });
          } else {
            console.error("[booking] API request failed (no response)", {
              key,
              url,
              durationMs,
              errorName: (err as Error)?.name,
              errorMessage: (err as Error)?.message,
            });
          }
          throw err;
        });
      inFlight.set(key, p);
      return p;
    })();

  if (!signal) return basePromise;

  // Wrap with per-caller abort so the caller's effect cleanup fires correctly.
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("", "AbortError"));
      return;
    }
    const onAbort = () => reject(new DOMException("", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    basePromise.then(
      (data) => {
        signal.removeEventListener("abort", onAbort);
        resolve(data);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err as Error);
      },
    );
  });
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExperienceListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  /** From listing Firestore; used for cards when hero is video or empty. */
  gallery: string[];
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
}

export interface CachedSlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  boatId?: string;
  dateStr?: string;
  spotsRemaining?: number;
  isCharterLocked?: boolean;
  showSpotsRemaining?: boolean;
  maxCapacity?: number;
  unresolvedBoatId?: boolean;
}

export interface DatePricesResult {
  prices: Record<string, number>;
  holidayDateStrings: string[];
  ticketsAvailableByDate: Record<string, number>;
  /** True when legacy hold pagination timed out (ticketed path); counts may omit some legacy holds. */
  partialData?: boolean;
}

export interface ExperienceDetailResult {
  experienceId?: string;
  slug?: string;
  title?: string;
  pricingType?: "charter" | "ticketed";
  maxGuests?: number;
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
  allowTipNow?: boolean;
  allowTipLater?: boolean;
  boats: unknown[];
  rates: unknown[];
  addons: unknown[];
  seasonal?: CachedSeasonalConfig;
}

export interface CachedRateOption {
  id: string;
  durationHours: number;
  displayName: string;
  priceCents: number;
}

/** Seasonal config from Experience; used to restrict calendar to available months. */
export interface CachedSeasonalConfig {
  enabled?: boolean;
  startMonth?: number;
  endMonth?: number;
  startDate?: string;
  endDate?: string;
}

export interface ExperienceBySlugResult {
  id?: string;
  rates?: CachedRateOption[];
  experience?: {
    title?: string;
    maxGuests?: number;
    petsMax?: number;
    pricingType?: "charter" | "ticketed";
    departureHour?: number;
    departureMinute?: number;
    showSpotsRemaining?: boolean;
    seasonal?: CachedSeasonalConfig;
    allowDeposit?: boolean;
    allowTipNow?: boolean;
    allowTipLater?: boolean;
  };
  addons?: Array<{
    id?: string;
    name: string;
    description?: string;
    priceCents: number;
    type: string;
    maxQty?: number;
  }>;
}

// ─── Public fetch helpers ─────────────────────────────────────────────────────

export function fetchExperiences(
  signal?: AbortSignal,
): Promise<{ experiences: ExperienceListItem[] }> {
  return fetchCached("experiences", "/api/experiences", STALE_MS.experiences, signal, "default");
}

export function fetchSlots(
  experienceId: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
  options?: { ticketed?: boolean },
): Promise<{ slots: CachedSlotDto[]; partialData?: boolean }> {
  const v = getSlotCacheVersion();
  const key = `slots|${experienceId}|${startDate}|${endDate}|${v}`;
  const url = `/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&endDate=${endDate}&v=${encodeURIComponent(v)}`;
  const staleMs = options?.ticketed ? STALE_MS.slotsTicketed : STALE_MS.slots;
  return fetchCached(key, url, staleMs, signal);
}

/** Force-fresh slots read (no in-memory reuse) for pre-checkout validation. */
export async function fetchSlotsFresh(
  experienceId: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
  options?: { ticketed?: boolean },
): Promise<{ slots: CachedSlotDto[]; partialData?: boolean }> {
  const v = getSlotCacheVersion();
  const base = getApiBaseUrl();
  const url = `${base ? `${base}` : ""}/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&endDate=${endDate}&v=${encodeURIComponent(v)}`;
  const res = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: typeof window !== "undefined" && (!base || base === window.location.origin) ? "include" : "omit",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { slots: CachedSlotDto[]; partialData?: boolean };
  const key = `slots|${experienceId}|${startDate}|${endDate}|${v}`;
  const staleMs = options?.ticketed ? STALE_MS.slotsTicketed : STALE_MS.slots;
  dataCache.delete(key);
  dataCache.set(key, { data, fetchedAt: Date.now() - Math.max(0, staleMs - 1) });
  return data;
}

/** Milliseconds since epoch when the current in-memory slots cache entry was stored (for staleness checks in the booking modal). */
export function getSlotsCacheFetchedAt(experienceId: string, startDate: string, endDate: string): number | null {
  const v = getSlotCacheVersion();
  const key = `slots|${experienceId}|${startDate}|${endDate}|${v}`;
  const entry = dataCache.get(key) as CacheEntry<unknown> | undefined;
  return entry?.fetchedAt ?? null;
}

export function fetchDatePrices(
  experienceId: string,
  startDate: string,
  days: number,
  rateId: string | undefined,
  signal?: AbortSignal,
): Promise<DatePricesResult> {
  const v = getSlotCacheVersion();
  const rateQ = rateId ? `&rateId=${encodeURIComponent(rateId)}` : "";
  const key = `date-prices|${experienceId}|${startDate}|${days}|${rateId ?? ""}|${v}`;
  const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&days=${days}${rateQ}&v=${encodeURIComponent(v)}`;
  return fetchCached(key, url, STALE_MS.datePrices, signal);
}

const PREFETCH_CONCURRENCY = 2;

/** Single-rate prefetch task for the global queue. */
interface PrefetchTask {
  experienceId: string;
  startDate: string;
  days: number;
  rateId: string;
  signal?: AbortSignal;
}

const prefetchQueue: PrefetchTask[] = [];
let prefetchRunning = 0;

function drainPrefetchQueue(): void {
  while (prefetchRunning < PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
    const task = prefetchQueue.shift()!;
    if (task.signal?.aborted) continue;
    const v = getSlotCacheVersion();
    const key = `date-prices|${task.experienceId}|${task.startDate}|${task.days}|${task.rateId}|${v}`;
    if (dataCache.get(key)) continue;
    prefetchRunning++;
    const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(task.experienceId)}&startDate=${task.startDate}&days=${task.days}&rateId=${encodeURIComponent(task.rateId)}&v=${encodeURIComponent(v)}`;
    fetchCached(key, url, STALE_MS.datePrices, task.signal)
      .catch(() => {})
      .finally(() => {
        prefetchRunning--;
        drainPrefetchQueue();
      });
  }
}

export function prefetchDatePrices(
  experienceId: string,
  startDate: string,
  days: number,
  rateIds: string[],
  signal?: AbortSignal,
): void {
  const list = rateIds.filter((id) => id != null && id !== "");
  if (list.length === 0 || signal?.aborted) return;

  for (const rateId of list) {
    prefetchQueue.push({ experienceId, startDate, days, rateId, signal });
  }
  drainPrefetchQueue();
}

export function fetchExperienceDetail(
  experienceId: string,
  signal?: AbortSignal,
): Promise<ExperienceDetailResult> {
  const key = `experience-detail|${experienceId}`;
  const url = `/api/booking/experience-detail?experienceId=${encodeURIComponent(experienceId)}`;
  return fetchCached(key, url, STALE_MS.experienceDetail, signal);
}

export function fetchExperienceBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<ExperienceBySlugResult> {
  const key = `experience-slug|${slug}`;
  const url = `/api/experiences/${encodeURIComponent(slug)}`;
  return fetchCached(key, url, STALE_MS.experienceBySlug, signal);
}

export function fetchExperienceRates(
  experienceId: string,
  signal?: AbortSignal,
): Promise<{ rates: CachedRateOption[] }> {
  const key = `experience-rates|${experienceId}`;
  const url = `/api/experiences/rates?experienceId=${encodeURIComponent(experienceId)}`;
  return fetchCached(key, url, STALE_MS.experienceRates, signal);
}

export function fetchBoats(
  experienceId: string,
  signal?: AbortSignal,
): Promise<{ boats: unknown[] }> {
  const key = `boats|${experienceId}`;
  const url = `/api/booking/boats?experienceId=${encodeURIComponent(experienceId)}`;
  return fetchCached(key, url, STALE_MS.boats, signal);
}

export function invalidate(prefix: string): void {
  for (const key of Array.from(dataCache.keys())) {
    if (key.startsWith(prefix)) dataCache.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

/**
 * Call this after a booking is confirmed to flush stale slot and price data for
 * the relevant experience so the next view fetches fresh availability.
 * Also bumps the slot cache version (localStorage) so fetchSlots/fetchDatePrices
 * use a new key and bypass in-memory cache across tabs.
 */
export function invalidateBookingCaches(experienceId: string): void {
  invalidate(`slots|${experienceId}|`);
  invalidate(`date-prices|${experienceId}|`);
  invalidate(`boats|${experienceId}`);
  invalidate(`experience-detail|${experienceId}`);
  invalidate(`experience-rates|${experienceId}`);
  setSlotCacheVersion();
}

/** Bump slot/date-price cache version without invalidating a specific experience key prefix. */
export function bumpSlotCacheVersion(): void {
  setSlotCacheVersion();
}

let crossTabInvalidationRegistered = false;

/**
 * When another tab bumps `bb_slot_cache_version` (via booking confirmation), drop in-memory
 * slot and date-price entries so this tab refetches on the next read.
 */
export function initCrossTabInvalidation(): void {
  if (typeof window === "undefined" || crossTabInvalidationRegistered) return;
  crossTabInvalidationRegistered = true;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      if (!slotInvalidationBroadcast) {
        slotInvalidationBroadcast = new BroadcastChannel(SLOT_CACHE_BROADCAST_CHANNEL);
      }
      slotInvalidationBroadcast.addEventListener("message", (event: MessageEvent) => {
        if (event?.data?.key !== SLOT_CACHE_VERSION_KEY) return;
        invalidate("slots|");
        invalidate("date-prices|");
      });
    } catch {
      // keep storage-event fallback
    }
  }
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== SLOT_CACHE_VERSION_KEY) return;
    invalidate("slots|");
    invalidate("date-prices|");
  });
}
