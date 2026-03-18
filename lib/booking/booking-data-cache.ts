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
 * Abort handling: the underlying fetch is never cancelled (letting it complete keeps
 * the cached result available for the next mount). Each caller receives a per-caller
 * race against its own AbortSignal, so state updates are skipped when a component
 * unmounts or its deps change.
 *
 * Production: when NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL) is set and valid and
 * matches the current origin, API requests use it; otherwise the cache falls back to
 * same-origin and logs a guarded warning so misconfiguration is diagnosable. Public
 * availability requests use credentials only for same-origin to avoid cross-origin issues.
 */

/**
 * Returns the base URL for API requests. Validates env-provided URL; falls back to
 * same-origin when invalid or when origin does not match the current page (avoids
 * wrong production value breaking availability requests). Logs a guarded warning
 * when an override is rejected so production misconfiguration is diagnosable.
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
      console.warn(
        "[booking-data-cache] NEXT_PUBLIC_SITE_URL (or APP_URL) is not a valid URL; using same-origin.",
        { value: fromEnv },
      );
    }
    return origin;
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      console.warn(
        "[booking-data-cache] NEXT_PUBLIC_SITE_URL must be http or https; using same-origin.",
        { value: fromEnv },
      );
    }
    return origin;
  }
  const envOrigin = parsed.origin;
  if (envOrigin !== origin) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      console.warn(
        "[booking-data-cache] NEXT_PUBLIC_SITE_URL origin does not match current origin; using same-origin to avoid cross-origin requests.",
        { envOrigin, currentOrigin: origin, value: fromEnv },
      );
    }
    return origin;
  }
  return envOrigin;
}

const STALE_MS = {
  experiences: 60_000,
  slots: 15_000,
  /** Shorter TTL for ticketed experiences so departure/slot config changes are picked up quickly. */
  slotsTicketed: 5_000,
  datePrices: 60_000,
  experienceDetail: 60_000,
  experienceBySlug: 60_000,
  experienceRates: 3_600_000, // 1 hour — rates are static during booking
  boats: 60_000,
} as const;

/** Maximum number of resolved entries kept in memory at once. Oldest is evicted when exceeded. */
const MAX_CACHE_SIZE = 120;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function evictOldestIfNeeded(): void {
  if (dataCache.size <= MAX_CACHE_SIZE) return;
  // Map iteration order is insertion order, so the first key is the oldest.
  const firstKey = dataCache.keys().next().value;
  if (firstKey !== undefined) dataCache.delete(firstKey);
}

function fetchCached<T>(
  key: string,
  url: string,
  staleMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("", "AbortError"));

  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < staleMs) {
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
        cache: "no-store",
      };
      // Run without signal so the response is always cached even when a caller
      // aborts early. Per-caller abort is handled by the wrapper below.
      const startMs = Date.now();
      const p = fetch(fullUrl, fetchOpts)
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
          const partialData = res.headers.get("X-Slots-Partial-Data") === "true";
          const data = (await res.json()) as T;
          if (partialData && data && typeof data === "object" && !Array.isArray(data)) {
            (data as T & { partialData?: boolean }).partialData = true;
          }
          return data;
        })
        .then((data) => {
          dataCache.delete(key); // remove then re-insert to update insertion order (LRU)
          dataCache.set(key, { data, fetchedAt: Date.now() });
          evictOldestIfNeeded();
          inFlight.delete(key);
          return data;
        })
        .catch((err: unknown) => {
          inFlight.delete(key);
          const durationMs = Date.now() - startMs;
          const isAbort = (err as { name?: string })?.name === "AbortError";
          if (isAbort) throw err;
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
}

export interface DatePricesResult {
  prices: Record<string, number>;
  holidayDateStrings: string[];
  ticketsAvailableByDate: Record<string, number>;
}

export interface ExperienceDetailResult {
  boats: unknown[];
  rates: unknown[];
  addons: unknown[];
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
  return fetchCached("experiences", "/api/experiences", STALE_MS.experiences, signal);
}

export function fetchSlots(
  experienceId: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
  options?: { ticketed?: boolean },
): Promise<{ slots: CachedSlotDto[]; partialData?: boolean }> {
  const key = `slots|${experienceId}|${startDate}|${endDate}`;
  const url = `/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&endDate=${endDate}`;
  const staleMs = options?.ticketed ? STALE_MS.slotsTicketed : STALE_MS.slots;
  return fetchCached(key, url, staleMs, signal);
}

export function fetchDatePrices(
  experienceId: string,
  startDate: string,
  days: number,
  rateId: string | undefined,
  signal?: AbortSignal,
): Promise<DatePricesResult> {
  const rateQ = rateId ? `&rateId=${encodeURIComponent(rateId)}` : "";
  const key = `date-prices|${experienceId}|${startDate}|${days}|${rateId ?? ""}`;
  const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&days=${days}${rateQ}`;
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
    const key = `date-prices|${task.experienceId}|${task.startDate}|${task.days}|${task.rateId}`;
    if (dataCache.get(key)) continue;
    prefetchRunning++;
    const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(task.experienceId)}&startDate=${task.startDate}&days=${task.days}&rateId=${encodeURIComponent(task.rateId)}`;
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
 */
export function invalidateBookingCaches(experienceId: string): void {
  invalidate(`slots|${experienceId}|`);
  invalidate(`date-prices|${experienceId}|`);
}
