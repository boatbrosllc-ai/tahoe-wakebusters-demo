# Booking performance fix — implementation plan (Phases A–D)

**Invariant:** Experience rates are static during booking; safe to cache aggressively.

**Goal:** Remove waterfall (date-prices waiting on experience-detail), make duration changes feel instant, add loading UI, reduce cold start impact.

**Constraints:** No changes to booking correctness, slot/hold/transaction logic. Incremental, minimal diffs.

---

## Phase A — Make rates available immediately (no waterfall)

**Choice:** Use the **existing** `GET /api/experiences/rates?experienceId=...` route (single Firestore read, minimal payload). No new route. Add long Cache-Control and call it eagerly from BookingModal when an experience is selected so we have a rateId before experience-detail returns.

**Why not add rates to the list:** Would require N+1 (one rates subcollection per experience) or a heavier list response; the list is already loaded on modal open and we only need rates when the user selects one experience.

**Confirmation:** Duration buttons will render as soon as `ratesSummary` (from `fetchExperienceRates`) returns; experience-detail can still load in parallel and we merge into `ratesForSelection` when it arrives.

---

### A1. `app/api/experiences/rates/route.ts`

**Change:** Add Cache-Control with long TTL. Sort rates by duration for deterministic “first” rate.

**Before:**
```ts
    const rates = ratesSnap.docs.map((r) => {
      const d = r.data() as ExperienceRate;
      return {
        id: r.id,
        durationHours: d.durationHours,
        displayName: d.displayName,
        priceCents: d.priceCents,
      };
    });
    return NextResponse.json({ rates });
```

**After:**
```ts
    const rates = ratesSnap.docs
      .map((r) => {
        const d = r.data() as ExperienceRate;
        return {
          id: r.id,
          durationHours: d.durationHours,
          displayName: d.displayName,
          priceCents: d.priceCents,
        };
      })
      .sort((a, b) => (a.durationHours ?? 0) - (b.durationHours ?? 0));
    return NextResponse.json(
      { rates },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
```

**Risk:** None. Same response shape; only order and caching change.

---

### A2. `lib/booking/booking-data-cache.ts`

**Change:** Add longer TTL for rates so the “config” path is cached aggressively. Add `fetchRatesSummary` that uses the same URL and a 1-hour stale (or reuse `fetchExperienceRates` with increased TTL).

**Option (simplest):** Increase `STALE_MS.experienceRates` to 1 hour so any caller (CalendarModal, BookingModal) gets the benefit. No new function.

**Before:**
```ts
const STALE_MS = {
  experiences: 60_000,
  slots: 30_000,
  datePrices: 60_000,
  experienceDetail: 60_000,
  experienceBySlug: 60_000,
  experienceRates: 60_000,
  boats: 60_000,
} as const;
```

**After:**
```ts
const STALE_MS = {
  experiences: 60_000,
  slots: 30_000,
  datePrices: 60_000,
  experienceDetail: 60_000,
  experienceBySlug: 60_000,
  experienceRates: 3_600_000, // 1 hour — rates are static during booking
  boats: 60_000,
} as const;
```

**Risk:** CalendarModal and others will keep rates 1h; acceptable per invariant.

---

### A3. `components/site/BookingModal.tsx`

**Changes:**
1. Add state: `ratesSummary: CachedRateOption[] | null` (use `CachedRateOption` from booking-data-cache).
2. When `selectedExperience?.id` is set, call `fetchExperienceRates(experienceId)` in a new effect (in parallel with experience-detail). On success set `setRatesSummary(data.rates ?? [])` and `setSelectedRateIdForCalendar(prev => prev ?? (data.rates?.[0]?.id ?? null))`.
3. Clear `ratesSummary` when experience changes (same effect cleanup or when `selectedExperience?.id` changes set `ratesSummary` to null at start).
4. Derive `ratesForSelection`: `experienceRates.length ? experienceRates : (ratesSummary ?? [])`.
5. When experience-detail returns we already set `experienceRates`; no need to clear `ratesSummary` — `ratesForSelection` will prefer `experienceRates` when non-empty.

**Import:** Ensure `CachedRateOption` is imported from `@/lib/booking/booking-data-cache` if not already (modal may use a local type; use the cache type for `ratesSummary`).

**New effect (insert after the experience-detail effect, ~line 432):**
```ts
  // Fetch rates immediately on experience selection so we can show duration and start date-prices without waiting for experience-detail.
  useEffect(() => {
    if (!selectedExperience?.id) {
      setRatesSummary(null);
      return;
    }
    const controller = new AbortController();
    bookingCache.fetchExperienceRates(selectedExperience.id, controller.signal)
      .then((data) => {
        const list = data?.rates ?? [];
        setRatesSummary(list);
        setSelectedRateIdForCalendar((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setRatesSummary(null);
      });
    return () => controller.abort();
  }, [selectedExperience?.id]);
```

**State declaration (add with other useState, ~line 195):**
```ts
  const [ratesSummary, setRatesSummary] = useState<CachedRateOption[] | null>(null);
```

**Replace `ratesForSelection` derivation (~line 251):**
```ts
  const ratesForSelection = experienceRates.length > 0 ? experienceRates : (ratesSummary ?? []);
```

**Reset on modal open:** In the `useEffect` that runs when `open` becomes true (~line 300), add:
```ts
    setRatesSummary(null);
```

**Risk:** If experiences/rates returns before experience-detail and the two ever disagree (e.g. admin changed rates between requests), the “valid rate” effect already resets `selectedRateIdForCalendar` when it’s not in `ratesForSelection`; once experience-detail arrives `ratesForSelection` becomes experience-detail’s rates. Mitigation: keep existing validation effect that clears `selectedRateIdForCalendar` when invalid.

---

## Phase B — Prefetch date-prices for all durations

**Behavior:** Once we have the list of rateIds (from `ratesSummary` or `experienceRates`), fetch date-prices for the selected rate in foreground; prefetch for other rateIds in background with concurrency limit 2–3 and AbortController per experience/month.

---

### B1. `lib/booking/booking-data-cache.ts`

**Change:** Add `prefetchDatePrices(experienceId, startDate, days, rateIds, options?)` that:
- Takes `rateIds: string[]`, `signal?: AbortSignal`, and optional `concurrency?: number` (default 2).
- Foreground: not applied here (caller will call `fetchDatePrices` for selected rate).
- For each `rateId` in `rateIds`, if not already in cache (or optionally always), enqueue a fetch. Run at most `concurrency` at a time. Each fetch uses existing `fetchCached` (same key/url as `fetchDatePrices`). If `signal` aborts, stop starting new prefetches and ignore in-flight results.

**New function (add after `fetchDatePrices`):**
```ts
const PREFETCH_CONCURRENCY = 2;

export function prefetchDatePrices(
  experienceId: string,
  startDate: string,
  days: number,
  rateIds: string[],
  signal?: AbortSignal,
  concurrency: number = PREFETCH_CONCURRENCY,
): void {
  const list = rateIds.filter((id) => id != null && id !== "");
  if (list.length === 0 || signal?.aborted) return;

  let idx = 0;
  let running = 0;
  const next = () => {
    if (signal?.aborted || idx >= list.length) return;
    const rateId = list[idx++];
    const key = `date-prices|${experienceId}|${startDate}|${days}|${rateId}`;
    if (dataCache.get(key)) {
      next();
      return;
    }
    running++;
    const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&days=${days}&rateId=${encodeURIComponent(rateId)}`;
    fetchCached(key, url, STALE_MS.datePrices, signal).finally(() => {
      running--;
      if (running < concurrency) next();
    });
  };
  for (let i = 0; i < concurrency; i++) next();
}
```

**Note:** `fetchCached` is used; we need to avoid double-import. Actually the prefetch should just trigger the same URL so that when the user switches duration the cache hits. So we call `fetchCached` for each rateId. But `fetchCached` returns a Promise and we don’t want to await all — we want fire-and-forget with concurrency limit. So the above is a small helper that limits concurrency. Fix: we need to start `concurrency` workers that each pull from a queue. Let me simplify:

```ts
export function prefetchDatePrices(
  experienceId: string,
  startDate: string,
  days: number,
  rateIds: string[],
  signal?: AbortSignal,
  concurrency: number = 2,
): void {
  const list = rateIds.filter((id) => id != null && id !== "");
  if (list.length === 0 || signal?.aborted) return;

  let idx = 0;
  const next = () => {
    if (signal?.aborted || idx >= list.length) return;
    const rateId = list[idx++];
    const key = `date-prices|${experienceId}|${startDate}|${days}|${rateId}`;
    if (dataCache.get(key)) {
      next();
      return;
    }
    const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&days=${days}&rateId=${encodeURIComponent(rateId)}`;
    fetchCached(key, url, STALE_MS.datePrices, signal).finally(next);
  };
  for (let i = 0; i < Math.min(concurrency, list.length); i++) next();
}
```

But that doesn’t limit concurrency to 2 — each call to `next()` starts one more. We need a semaphore: only start a new fetch when one completes. So:

```ts
export function prefetchDatePrices(
  experienceId: string,
  startDate: string,
  days: number,
  rateIds: string[],
  signal?: AbortSignal,
  concurrency: number = 2,
): void {
  const list = rateIds.filter((id) => id != null && id !== "");
  if (list.length === 0 || signal?.aborted) return;

  let idx = 0;
  let running = 0;
  const next = () => {
    if (signal?.aborted || idx >= list.length) {
      return;
    }
    const rateId = list[idx++];
    const key = `date-prices|${experienceId}|${startDate}|${days}|${rateId}`;
    if (dataCache.get(key)) {
      next();
      return;
    }
    running++;
    const url = `/api/booking/date-prices?experienceId=${encodeURIComponent(experienceId)}&startDate=${startDate}&days=${days}&rateId=${encodeURIComponent(rateId)}`;
    fetchCached(key, url, STALE_MS.datePrices, signal)
      .finally(() => {
        running--;
        if (running < concurrency) next();
      });
  };
  for (let i = 0; i < concurrency; i++) next();
}
```

**Risk:** Extra requests (bounded by number of rates). Mitigation: concurrency 2, and only for other rateIds (exclude current).

**Import in BookingModal:** For `ratesSummary` state use the type `CachedRateOption[]` from `@/lib/booking/booking-data-cache` (already exported; same shape as experience-detail rates: id, durationHours, displayName, priceCents).

---

### B2. `components/site/BookingModal.tsx`

**Change:** After the date-prices effect that fetches for the selected rate, call `prefetchDatePrices` for the other rateIds. Use the same `controller.signal` and same `viewMonthStartStr`, `daysInViewMonth`. Cancel when experience or month changes (abort on effect cleanup).

**In the same effect that currently fetches date-prices (the one with deps `[selectedExperience?.id, viewMonthYear, viewMonthMonth, viewMonthStartStr, daysInViewMonth, selectedRateIdForCalendar]`), after starting the main fetch, call:**
```ts
    const otherRateIds = ratesForSelection
      .map((r) => r.id)
      .filter((id) => id !== selectedRateIdForCalendar);
    if (otherRateIds.length > 0) {
      bookingCache.prefetchDatePrices(
        selectedExperience.id,
        viewMonthStartStr,
        daysInViewMonth,
        otherRateIds,
        controller.signal,
        2,
      );
    }
```

**Issue:** `ratesForSelection` is derived and might be empty on first run (ratesSummary not yet loaded). So we should call prefetch when we have `ratesForSelection.length > 1` and a selected rate. Same effect is fine — when ratesSummary or experienceRates populates, the effect will re-run (because ratesForSelection is derived from state that changes). So we’re good.

**Risk:** Prefetch runs every time the effect runs (month/rate change). That’s desired; we only prefetch “other” rateIds so we don’t duplicate the foreground request.

---

## Phase C — Date-prices loading and race guards

**Behavior:** Add `datePricesLoading` and `inFlightKey`; set loading true when starting a fetch; show skeleton/overlay; apply response only if key matches; set loading false when latest request resolves.

---

### C1. `components/site/BookingModal.tsx`

**State:**
```ts
  const [datePricesLoading, setDatePricesLoading] = useState(false);
```

**inFlightKey:** Derive per request: `experienceId|viewMonthStartStr|daysInViewMonth|selectedRateIdForCalendar`. Store in a ref that we set when we start a fetch and compare when the response arrives.

**Effect (replace the current date-prices effect):**
- When `!selectedExperience?.id || !selectedRateIdForCalendar`, clear prices, set `datePricesLoading = false`, return.
- Build `key = `${selectedExperience.id}|${viewMonthStartStr}|${daysInViewMonth}|${selectedRateIdForCalendar}``.
- Set `datePricesLoading(true)`.
- Set a ref `inFlightKeyRef.current = key`.
- Call `fetchDatePrices(...).then((data) => { if (inFlightKeyRef.current === key) { setDatePrices(...); setHolidayDateStrings(...); setTicketsAvailableByDate(...); } }).finally(() => { if (inFlightKeyRef.current === key) setDatePricesLoading(false); })`.
- On catch, same: if key matches clear prices; in finally set loading false if key matches.
- Cleanup: abort controller; optionally set inFlightKeyRef to a discarded value so in-flight response is ignored.

**Ref:**
```ts
  const inFlightKeyRef = useRef<string | null>(null);
```

**Before (existing effect):**
```ts
  useEffect(() => {
    if (!selectedExperience?.id || !selectedRateIdForCalendar) {
      setDatePrices({});
      setHolidayDateStrings(new Set());
      setTicketsAvailableByDate({});
      return;
    }
    const controller = new AbortController();
    bookingCache.fetchDatePrices(
      selectedExperience.id,
      viewMonthStartStr,
      daysInViewMonth,
      selectedRateIdForCalendar,
      controller.signal,
    )
      .then((data) => { ... })
      .catch(...);
    return () => controller.abort();
  }, [selectedExperience?.id, viewMonthYear, viewMonthMonth, viewMonthStartStr, daysInViewMonth, selectedRateIdForCalendar]);
```

**After:**
```ts
  useEffect(() => {
    if (!selectedExperience?.id || !selectedRateIdForCalendar) {
      setDatePrices({});
      setHolidayDateStrings(new Set());
      setTicketsAvailableByDate({});
      setDatePricesLoading(false);
      return;
    }
    const key = `${selectedExperience.id}|${viewMonthStartStr}|${daysInViewMonth}|${selectedRateIdForCalendar}`;
    inFlightKeyRef.current = key;
    setDatePricesLoading(true);
    const controller = new AbortController();

    bookingCache
      .fetchDatePrices(
        selectedExperience.id,
        viewMonthStartStr,
        daysInViewMonth,
        selectedRateIdForCalendar,
        controller.signal,
      )
      .then((data) => {
        if (inFlightKeyRef.current !== key) return;
        const prices = data.prices && typeof data.prices === "object" ? data.prices : {};
        const holidays = new Set<string>(Array.isArray(data?.holidayDateStrings) ? data.holidayDateStrings : []);
        const ticketsAvailable =
          data.ticketsAvailableByDate && typeof data.ticketsAvailableByDate === "object" ? data.ticketsAvailableByDate : {};
        setDatePrices(prices);
        setHolidayDateStrings(holidays);
        setTicketsAvailableByDate(ticketsAvailable);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (inFlightKeyRef.current === key) {
          setDatePrices({});
          setHolidayDateStrings(new Set());
          setTicketsAvailableByDate({});
        }
      })
      .finally(() => {
        if (inFlightKeyRef.current === key) {
          setDatePricesLoading(false);
        }
      });

    const otherRateIds = ratesForSelection.map((r) => r.id).filter((id) => id !== selectedRateIdForCalendar);
    if (otherRateIds.length > 0) {
      bookingCache.prefetchDatePrices(
        selectedExperience.id,
        viewMonthStartStr,
        daysInViewMonth,
        otherRateIds,
        controller.signal,
        2,
      );
    }

    return () => {
      controller.abort();
      inFlightKeyRef.current = null;
    };
  }, [selectedExperience?.id, viewMonthYear, viewMonthMonth, viewMonthStartStr, daysInViewMonth, selectedRateIdForCalendar, ratesForSelection]);
```

**UI:** Where the calendar grid is rendered, wrap the calendar (or the price cells) in a conditional: when `datePricesLoading` is true, show a skeleton (e.g. same grid layout with placeholder blocks or a single “Loading dates…” overlay). Do **not** show `datePrices[dateStr]` as the price when `datePricesLoading` is true for the current key — show placeholder or skeleton so we never show stale prices from a previous rate.

**Example overlay (add around the calendar grid, ~line 1220):**
```tsx
{datePricesLoading && (
  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl z-10">
    <span className="text-sm text-brand-muted">Loading dates & prices…</span>
  </div>
)}
```
Parent of the calendar grid needs `position: relative` if not already.

**Risk:** Adding `ratesForSelection` to the effect deps might cause extra runs when experienceRates loads after ratesSummary. That’s acceptable — we refetch once when rates list changes; prefetch only runs for “other” rateIds so we don’t double-fetch the selected rate.

---

## Phase D — Netlify cold start mitigation

**D1. Firebase Admin singleton**  
Already true: `lib/booking/firebase-admin.ts` uses module-level `_app` and `_admin`; `getDb()` and `getFirebaseApp()` are lazy but singleton. No change.

**D2. Dynamic imports on hot paths**  
Booking API routes (date-prices, experience-detail, experiences/rates, create-hold, etc.) use static `import { getDb } from "@/lib/booking/firebase-admin"`. The only dynamic import on a hot path found was `app/api/health/route.ts` (`await import("@/lib/booking/firebase-admin")`). Health is not part of booking flow. No change required for booking.

**D3. Scheduled warm ping**  
Add a Netlify scheduled function that hits a lightweight booking-related endpoint every 5–10 minutes so the Next.js serverless (and Firebase init) stays warm.

**New file: `netlify/functions/warm-booking.mts`**
```ts
import { schedule } from "@netlify/functions";

export const handler = schedule("*/10 * * * *", async () => {
  const base = process.env.APP_BASE_URL ?? process.env.URL;
  if (!base) return { statusCode: 200 };
  const url = `${base.replace(/\/$/, "")}/api/experiences`;
  try {
    await fetch(url);
  } catch {
    // ignore
  }
  return { statusCode: 200 };
});
```

**netlify.toml:** Add:
```toml
[functions."warm-booking"]
  timeout = 10
```

**Risk:** One extra request every 10 minutes to /api/experiences. Minimal cost. If you prefer a dedicated /api/warm route that only calls getDb() and returns 200, we can add that and ping it instead.

---

## Summary

| Phase | File(s) | What |
|-------|---------|------|
| A1 | `app/api/experiences/rates/route.ts` | Cache-Control + sort rates |
| A2 | `lib/booking/booking-data-cache.ts` | STALE_MS.experienceRates = 1h |
| A3 | `components/site/BookingModal.tsx` | ratesSummary state, fetchExperienceRates on experience select, ratesForSelection = experienceRates \|\| ratesSummary, reset ratesSummary on open |
| B1 | `lib/booking/booking-data-cache.ts` | prefetchDatePrices() with concurrency 2 |
| B2 | `components/site/BookingModal.tsx` | Call prefetchDatePrices for other rateIds in date-prices effect |
| C1 | `components/site/BookingModal.tsx` | datePricesLoading, inFlightKeyRef, race guard, skeleton/overlay when loading |
| D  | `lib/booking/firebase-admin.ts` | No change (already singleton) |
| D  | `netlify/functions/warm-booking.mts` | New scheduled function; netlify.toml entry |

**Confirmation:** Duration buttons render as soon as `ratesSummary` is populated (from `fetchExperienceRates`), which runs in parallel with experience-detail. So duration can render before experience-detail finishes. Date-prices starts as soon as `selectedRateIdForCalendar` is set (from ratesSummary[0] or experienceRates[0]), so we remove the waterfall.
