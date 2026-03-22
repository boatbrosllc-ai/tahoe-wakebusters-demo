# Firebase “quota exceeded” / RESOURCE_EXHAUSTED audit

## Step 1: Firebase entry points (all server-side Admin SDK)

| Operation | File | Line(s) | Notes |
|-----------|------|---------|--------|
| **runTransaction** | `app/api/booking/create-hold/route.ts` | 185 | One tx per create-hold (slot + hold) |
| **runTransaction** | `app/api/booking/cleanup-holds/route.ts` | 30 | One tx **per** expired hold (up to 100/run) |
| **runTransaction** | `app/api/stripe/webhook/route.ts` | 139 | One tx per checkout.session.completed (slot + booking + hold) |
| **.get()** (collections) | `app/api/admin/dashboard/route.ts` | 22–23 | bookings + experiences |
| **.get()** | `app/api/admin/experiences/route.ts` | 109, 146, 169–179 | list, slug check, set |
| **.get() / .update() / .set()** | `app/api/admin/experiences/[id]/route.ts` | 119–126, 159–181 | GET + PATCH |
| **.get()** | `app/api/admin/financials/route.ts` | 18 | bookings limit 500 |
| **.get()** | `app/api/admin/customers/route.ts` | 18 | bookings limit 500 |
| **.get()** + N **.get()** | `app/api/admin/bookings/route.ts` | 21, 33–34 | bookings limit*2, then one get per experienceId |
| **.get()** | `app/api/booking/slots/route.ts` | 31–46, 83–88 | exp + rates + slots by date range (no cap on slot count) |
| **.get() / batch.set()** | `app/api/admin/blocks/block-date/route.ts` | 37–55 | rates + slots batch |
| **.get() / .set()** | `app/api/admin/blocks/block-slot/route.ts` | 35–37 | single slot |
| **.get() / runTransaction** | `app/api/booking/create-hold/route.ts` | 76–165, 185–215 | multiple gets + one tx |
| **.get()** | `app/api/booking/cleanup-holds/route.ts` | 19, 28–40 | holds query + tx per doc |
| **.get() / .set()** | `app/api/booking/receipt/route.ts` | 19–40 | booking + experience/slot/rate/boat |
| **.get() / .set() / runTransaction** | `app/api/stripe/webhook/route.ts` | 43–53, 56–151, 177 | event idempotency + many gets + one tx |
| **.get() / .update()** | `app/api/booking/create-checkout-session/route.ts` | 25–93 | hold + experience/boat + update |
| **.get()** | `app/api/experiences/route.ts` | 20–24 | experiences + rates per doc |
| **.get()** | `app/api/experiences/[slug]/route.ts` | 23–35 | experience + rates + addons |
| **.get() / .set()** | `app/api/booking/seed/route.ts` | 69–121 | boats, rates, addons, slots |
| **.get()** | `app/api/booking/boats/route.ts` | 22 | boats |
| **.get()** | `app/api/booking/boat/[boatId]/route.ts` | 12, 21–22 | boat + rates + addons |
| **.get()** | `lib/booking/get-experience-by-slug.ts` | 14–23 | experience + rates + addons |
| **.get()** | `lib/booking/setup-status.ts` | 39 | experiences |
| **.get()** | `lib/booking/seed-experiences.ts` | 131–156 | experiences + rates + addons |

**No client-side Firestore:** no `onSnapshot`, `getDocs`, `getDoc`, `setDoc`, etc. All access is via Next.js API routes using Firebase Admin SDK (`getDb()`).

---

## Step 2: Runaway listeners

**None.** The app does not use Firestore real-time listeners (`onSnapshot`). All reads are one-off `.get()` in API routes.

---

## Step 3: Write loops and retry-driven load

| Pattern | Location | Risk |
|--------|----------|------|
| **Stripe webhook retries** | `app/api/stripe/webhook/route.ts` | **CRITICAL.** Idempotency was a single `eventDoc.get()`; the event doc was only written **after** the transaction. So: (1) Retries re-run the whole handler (many reads + tx). (2) If the first run succeeded but the response was slow or we threw after the tx (e.g. email), Stripe retries; the second run’s tx fails (slot already booked) → 500 → more retries. Result: repeated reads and failed writes on every retry, driving quota and errors. **Fix:** Claim the event in a **transaction** at the start (get event doc; if exists return; else set `{ receivedAt, status: "processing" }`). Then do the rest. Retries then see the doc and return 200 without doing more work. **Implemented.** |
| create-hold → checkout → webhook | Normal flow | Single tx per booking; no loop. |
| cleanup-holds | `app/api/booking/cleanup-holds/route.ts` | Sequential `runTransaction` per expired hold (up to 100). No retry loop in code; if cron runs every 1–5 min, load is bounded. |

---

## Step 4: Hot documents

| Document / path | Writes | Notes |
|-----------------|--------|--------|
| `stripeEvents/{eventId}` | 1 per event (now claimed once at start) | Idempotency; no hot write. |
| `experiences/{id}/slots/{slotId}` | hold → release or convert | A few writes per slot per booking flow. Hot only if the same slot is held/released in a tight loop (none found). |
| `holds/{holdId}` | create → convert or expire | One write per hold. |
| `bookings/{id}` | 1 create per booking | Not hot. |

No sharding or batching changes required for current usage.

---

## Step 5: Server-side retries / cron

| Item | Finding |
|------|--------|
| **cleanup-holds** | Called externally (cron / manual). No automatic retry in code. Doc says “every 5–10 minutes”; no `vercel.json` cron in repo. |
| **Stripe webhook** | Stripe retries on non-2xx or timeout. Now mitigated by claiming the event in a transaction at the start. |
| **Netlify/Cloud Functions** | Not used; Next.js API routes only. |

---

## Step 6: Blaze and limits

- **Blaze** removes free-tier daily caps but does **not** remove:
  - **Per-document write rate** (e.g. 1 write/sec sustained per document).
  - **RESOURCE_EXHAUSTED** from too many operations in a short time (e.g. many retries re-running the same handler).
- The Stripe webhook was the only place where **retries re-executed the full handler** (many reads + transaction). That directly causes repeated load and can trigger quota/429.

---

## Step 7: Root cause and fix

### Root cause

- **File:** `app/api/stripe/webhook/route.ts`
- **Why quota exceeded on Blaze:** Stripe retries failed deliveries. The handler only checked `eventDoc.exists` with a plain `get()` and wrote the event doc **after** the transaction. So:
  1. Every retry re-did all reads and the conversion transaction.
  2. After a successful conversion, a later retry’s transaction failed (slot already booked) → 500 → more retries.
- **Result:** Repeated reads and failed writes per event, amplifying Firestore usage and triggering RESOURCE_EXHAUSTED.

### Minimal fix (implemented)

- **Claim the event in a transaction at the start:**
  - In a single `db.runTransaction`: get `stripeEvents/{eventId}`; if it exists, return `false`; otherwise set it to `{ receivedAt: Timestamp.now(), status: "processing" }` and return `true`.
  - If `!claimed`, return `NextResponse.json({ received: true })` immediately.
  - Only the request that wins the transaction runs the rest of the handler; Stripe retries see the doc and return 200 without extra reads/writes.
- **No change** to Firestore structure, to other routes, or to client behavior.

### Additional fixes applied

- **Stripe webhook catch:** On any thrown error, the handler now sets the event doc to `{ processedAt, error }` so the doc is not left in `"processing"` and retries still see it and return 200. Prevents repeated 500s and quota from retries.
- **cleanup-holds:** Added a 50 ms delay between each transaction (after each released hold) to smooth write rate and avoid RESOURCE_EXHAUSTED when many holds expire in one run.
- **Slots API:** Capped date range to 92 days max; requests with a larger range return 400. Prevents unbounded slot queries and read spikes.

---

## Success criteria

- Stripe retries no longer re-run the conversion logic → no duplicate work, no repeated failed transactions.
- Firebase usage from the webhook stabilizes; quota/429 from this path should stop.
- Real-time behavior unchanged (no listeners in use).
- No intentional increase in reads or writes; idempotency reduces them on retries.
