# Booking system audit

**Scope:** All code related to creating, saving, using, and managing bookings (holds, slots, payments, admin, crons).  
**Date:** 2025-03-06  
**Type:** Read-only audit — no edits.  
**Updates:** 2025-03-06 — Critical and medium issues below have been fixed (see commit / changelog).

---

## 1. Architecture overview

- **Customer flow:** Create hold → Pay (Payment Element or Stripe Checkout) → Webhook and/or `complete-after-payment` converts hold to booking → Confirmation email, receipt/success page, manage link.
- **Data:** Firestore `bookings`, `holds`, `slots` (under experiences or boats), `departureInventory` (ticketed), `blocks`, `stripeEvents`, `discounts`, `pendingRefunds`.
- **Payments:** Stripe Payment Intents (deposit + final) or legacy Checkout Session (full or redirect). Webhook handles `payment_intent.succeeded` and `checkout.session.completed`; idempotency via `stripeEvents` lease and hold status.

---

## 2. Critical issues

### 2.1 Shared/ticketed: `checkout.session.completed` and departure capacity — **FIXED**

**Location:** `app/api/stripe/webhook/route.ts` — paid `checkout.session.completed` for an **active** hold.

**Resolution:** The active-hold path uses `runCheckoutSessionActiveHoldConversion`, which calls **`convertHoldToBooking`** (same as Payment Element / async paths). Shared/ticketed capacity release remains inside `convertHoldToBooking` / shared-departure helpers. Ticketed experiences are not routed through `create-checkout-session-direct` (that endpoint returns `ticketedFlowRequired`).

---

### 2.2 Cron auth inconsistency: `reminder-cron` returns 401 for Unauthorized — **FIXED**

**Location:** `app/api/booking/reminder-cron/route.ts`.

**Issue:** Other cron routes return **401** for wrong/missing `CRON_SECRET`; `reminder-cron` returned **503**.

**Fix applied:** Unauthorized response is now `status: 401` to match other crons.

---

## 3. Medium / design considerations

### 3.1 Admin “Add booking” (POST) and ticketed capacity

**Location:** `app/api/admin/bookings/route.ts` — POST handler.

**Update (2026-03):** For `pricingType === "ticketed"` and `bookingMode === "shared"` (send `bookingMode: "shared"` in the JSON body), the handler runs the same `reserveCapacity` / `departureInventory` logic as customer `create-hold` inside the booking transaction, and persists `bookingMode`, `pricingType`, and `startDateStr` on the booking document for parity with automated bookings. Ticketed **charter** manual bookings remain unsupported via this endpoint (400 — use the customer flow).

**Historical note:** Earlier versions blocked all ticketed admin creates or skipped inventory; that allowed overbooking for shared ticketed departures.

---

### 3.1a Cron `cleanup-holds` and client slot cache

**Location:** `app/api/booking/cleanup-holds/route.ts`.

**Observation:** Expired holds are released server-side without calling client `bumpSlotCacheVersion()` (that helper is browser-only). The cleanup route sets response header `X-Slots-Invalidated: true` when `processed > 0` so an edge/cron wrapper can trigger a broadcast or refetch if desired.

**Maximum desync:** Public slot responses are also gated by `NEXT_PUBLIC_SLOTS_REFETCH_ON_MOUNT_MS` (default ~12s in `BOOKING_AVAILABILITY.md` / app env). After cron-driven hold releases, other tabs may show stale availability until that TTL elaps unless the client refetches for another reason. Lower the env value if tighter consistency is required.

---

### 3.2 Duplicate conversion handling (hold already converted)

**Location:** `lib/booking/convert-hold-to-booking.ts` and webhook.

**Observation:** When a hold is already `converted`, `convertHoldToBooking` flags a second PaymentIntent (different from the one stored on the hold) via `pendingRefunds` and returns `alreadyConverted`. Webhook uses event lease and hold status to avoid double work. This is sound.

**Minor:** The webhook’s `checkout.session.completed` path does not have the same “duplicate PI → pendingRefunds” check when hold is already converted; it only checks `hold.status !== "active"` and returns idempotent success. If a second payment ever hit the same session/hold, consider logging or flagging similarly.

---

### 3.3 Run-final-charges: lock and retry

**Location:** `app/api/booking/run-final-charges/route.ts`.

**Observation:** `finalChargeLockAt` (10 min) prevents duplicate attempts; on Stripe failure status becomes `final_requires_action` or `final_failed` and email is sent. Lock is not cleared on failure, so retry is after 10 min. Intentional and reasonable.

**Note:** If Stripe returns a retryable error (e.g. temporary decline), the booking stays `final_due` until the next run; the lock applies per run, so it will be retried on a later cron cycle. No issue.

---

### 3.4 Receipt by `payment_intent_id`: deposit vs full

**Location:** `app/api/booking/receipt/route.ts`.

**Observation:** Lookup by `payment_intent_id` checks both `stripe.paymentIntentId` (legacy full) and `stripe.depositPaymentIntentId`. Success page can pass `payment_intent_id` after Payment Element flow and get the booking; receipt token is issued when not provided. Correct.

---

### 3.5 Direct checkout and ticketed

**Location:** `app/api/booking/create-checkout-session-direct/route.ts`.

**Observation:** Creates a hold and slot (charter/listing-boat style); does **not** set `bookingMode: "shared"` or use `reserveCapacity`. So direct checkout is charter-only. If the UI ever sent ticketed params here, capacity would not be reserved. Currently aligned with charter path only.

---

## 4. Lower priority / hygiene

### 4.1 Unused component — **FIXED**

**Location:** `components/experience/BookingModal.tsx` (removed).

**Issue:** Not imported anywhere. The live flow uses `components/site/BookingModal.tsx`.

**Fix applied:** File removed.

---

### 4.2 Legacy booking docs without `startDateStr`

**Locations:** Slots API, create-hold, create-checkout-session-direct, admin bookings POST.

**Observation:** Several paths have a “legacy” fallback that queries bookings without `startDateStr` (e.g. by `experienceId` + status) and filter in code. Comments mention backfilling `startDateStr` and eventually removing the fallback.

**Recommendation:** Run a one-off backfill for `startDateStr` from `slotId` where missing, then remove legacy branches when safe.

---

### 4.3 Webhook event lease

**Location:** `app/api/stripe/webhook/route.ts`.

**Observation:** `PROCESSING_LEASE_MS = 5 * 60 * 1000`; stale “processing” events can be re-claimed. Good for retries and duplicate delivery.

---

### 4.4 Rate limiting

**Location:** `lib/booking/rate-limit.ts`; used in create-hold, create-checkout-session-direct, validate-discount, etc.

**Observation:** Client key from trusted headers; Redis or in-memory. Document which endpoints are rate-limited and under what key for operations/monitoring.

---

## 5. Summary table

| Area                         | Status   | Notes                                                                 |
|-----------------------------|----------|-----------------------------------------------------------------------|
| Hold → booking (Payment Element) | OK       | `convertHoldToBooking` + webhook `payment_intent.succeeded`; shared capacity released. |
| Hold → booking (Checkout redirect) | Bug      | `checkout.session.completed` does not release shared-departure capacity. |
| Admin cancel                | OK       | Releases slot + shared-departure capacity (recent fix).               |
| Admin resend confirmation   | OK       | Supports boat-only and experience bookings.                           |
| Cron auth                   | Inconsistent | `reminder-cron` returns 503; others return 401 for unauthorized.   |
| Admin “Add booking”         | Caveat   | No departure inventory update for ticketed.                           |
| Receipt / success page      | OK       | Handles session_id, payment_intent_id, receipt_token; shared/ticketed slot fallback. |
| Run-final-charges           | OK       | Lock, idempotency, final_requires_action / final_failed + email.     |
| Release hold (GET/POST)     | OK       | Shared logic; shared capacity released.                              |
| Cancel page UX              | OK       | Clear error + retry when token present.                               |
| Status badges (admin)       | OK       | Shared helper for list and detail.                                   |
| Error clear on success (admin) | OK    | Resend/cancel clear `error` state.                                   |

---

## 6. File reference (no changes)

- **APIs:** `app/api/booking/*` (create-hold, release-hold, create-checkout-session, create-checkout-session-direct, create-payment-intent, complete-after-payment, slots, receipt, manage/*, cleanup-holds, run-final-charges, reminder-cron, final-payment-reminder-cron, etc.), `app/api/admin/bookings/*`, `app/api/stripe/webhook/route.ts`.
- **Pages:** `app/(site)/booking/page.tsx`, `BookingPageClient.tsx`, success, cancel, manage; admin bookings, discounts, financials, calendars.
- **Components:** `components/site/BookingModal.tsx`, HoldCountdown, InlineBookingDetailsStep, ExperienceBookingCard, ExperienceCalendarSection*, admin calendar/week view.
- **Lib:** `lib/booking/types.ts`, `firebase-admin.ts`, `stripe-client.ts`, `brevo.ts`, `convert-hold-to-booking.ts`, `shared-departure-inventory.ts`, `manageToken.ts`, `receiptToken.ts`, `releaseToken.ts`, `rate-limit.ts`, `experience-slots.ts`, `pricing.ts`, `discount.ts`, email templates, reminder-emails.
- **Cron entrypoints:** `netlify/functions/cleanup-holds.mts`, `booking-reminder-cron.mts`, `final-payment-reminder-cron.mts`, `run-final-charges.mts`.
