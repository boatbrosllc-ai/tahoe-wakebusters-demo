# Why the booking flow is still slow (duration + dates/prices)

## Summary

The remaining slowness comes from: **(1) a strict request waterfall so dates/prices can’t start until after experience-detail is back, (2) every duration change triggering a full date-prices refetch with no cache hit, (3) no loading state for date-prices so the UI feels stuck, and (4) serverless cold start adding 10–30s on first or idle requests.**

---

## 1. Waterfall: duration and dates/prices wait on experience-detail

**What happens**

- User selects an **experience** → we call `fetchExperienceDetail(experienceId)` (boats + rates + addons).
- Duration options come from **rates**, which only exist after that response.
- `selectedRateIdForCalendar` is set from those rates (e.g. first rate), and the **date-prices** effect depends on it:

```ts
// BookingModal.tsx ~443
useEffect(() => {
  if (!selectedExperience?.id || !selectedRateIdForCalendar) {
    setDatePrices({});
    return;
  }
  bookingCache.fetchDatePrices(
    selectedExperience.id,
    viewMonthStartStr,
    daysInViewMonth,
    selectedRateIdForCalendar,  // need a rate before we can call
    controller.signal,
  )...
}, [selectedExperience?.id, ..., selectedRateIdForCalendar]);
```

So the order is:

1. Select experience → start **experience-detail**.
2. Experience-detail returns → we set `experienceRates` and then `selectedRateIdForCalendar` (e.g. first rate).
3. Only then does the **date-prices** request run.

So **date-prices never runs in parallel with experience-detail**. Total time to see dates/prices = experience-detail time + date-prices time, one after the other.

**Why “selecting duration” feels slow**

- The duration buttons only appear after experience-detail has returned (rates are in that response). So any delay in experience-detail is perceived as “slow to select duration” or “slow until I can do anything.”

---

## 2. Every duration change = full date-prices refetch (no cache hit)

**What happens**

- When the user clicks a different duration (e.g. “4 hours”), we update `selectedRateIdForCalendar`.
- The date-prices effect runs again and calls `fetchDatePrices(..., selectedRateIdForCalendar, ...)`.
- The client cache key includes `rateId` (`date-prices|${experienceId}|${startDate}|${days}|${rateId}`), so the other duration’s data is a different key. We don’t reuse the previous duration’s response.
- So **every duration change triggers a new network request**. If that request is slow (e.g. cold start or slow Firestore), the user waits again.

There is no prefetch of date-prices for other rates when the first one loads, so the first time you switch to 4hr you always pay full round-trip.

---

## 3. No loading state for date-prices

**What happens**

- We have `slotsLoading` for slot availability, but there is **no `datePricesLoading`** (or equivalent).
- When the user changes duration we start a new date-prices fetch but don’t clear or mark “loading”:
  - Either the calendar keeps showing **old prices** (from the previous duration) until the new response arrives, or
  - We could clear and show empty; either way there’s no “Loading prices…” or spinner for the calendar.
- So for 10–30 seconds the UI can look unchanged or wrong, which feels like “it’s stuck” or “it takes 30 seconds to load dates and prices.”

---

## 4. Serverless cold start (Netlify)

**What happens**

- On Netlify, the first request to an API route (or the first after idle) is often a **cold start**: Node process boot + bundle load + Firebase init (`getDb()` etc.). That can easily be **5–15+ seconds per route**.
- Flow today:
  - Select experience → **experience-detail** (often cold) → e.g. 10–15s.
  - Then **date-prices** runs → can be cold too → another 10–15s.
- So **20–30 seconds** to see dates/prices is consistent with two cold routes in sequence. Even one cold request (e.g. date-prices after changing duration) can explain “30 seconds to load dates and prices.”

Warm requests (same route hit recently) are much faster; the backend work (e.g. 2 + 3 Firestore reads for date-prices) is not the main cost when it’s slow.

---

## 5. What’s already in place (and what isn’t)

- **experience-detail**: One combined call for boats/rates/addons, reads in parallel. Good.
- **date-prices**: Reads are parallel; we only request the visible month (e.g. 28–31 days). Logic is not the bottleneck.
- **Slots**: Fetched as soon as we have `selectedExperience?.id` and view month; they don’t wait for a rate. So slots and experience-detail can run in parallel; only date-prices is forced to wait for experience-detail (because of `selectedRateIdForCalendar`).

The main structural issue is that **date-prices is gated on having a rate**, so it always runs after experience-detail and can’t overlap with it. That, plus cold start and no loading state, explains why it still feels “slow as shit” to select duration and “like 30 seconds” to load dates and prices.

---

## 6. Recommended directions (for a follow-up pass)

1. **Start date-prices as soon as we have an experience and a default rate**
   - e.g. Use a default rateId (e.g. first rate by duration) from a small, fast source (e.g. experience list or a tiny “rates summary” endpoint) so we can fire the first date-prices request in parallel with experience-detail, or at least not after it.
2. **Preload or cache date-prices for all rates**
   - When the first date-prices response arrives, optionally prefetch for other rates in the background, or cache per rate so switching back is instant.
3. **Add a loading state for date-prices**
   - e.g. `datePricesLoading` and show “Loading prices…” or a skeleton on the calendar when we’re refetching (e.g. after duration change), and avoid showing stale prices for the wrong duration.
4. **Reduce impact of cold start**
   - Keep serverless functions warm (scheduled ping), or move the heaviest paths to a warmer runtime if Netlify supports it.
5. **Optional: show durations before experience-detail**
   - If you can get a minimal list of rate IDs/durations from somewhere cheap (e.g. from the experience list or a very light endpoint), show duration choices immediately and let experience-detail load boats/addons in parallel; then date-prices can run as soon as the user has picked a duration (or use the default).

Implementing (1), (3), and (4) would address most of the perceived slowness without a big redesign.
