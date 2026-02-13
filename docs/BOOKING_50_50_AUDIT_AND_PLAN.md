# Booking 50/50 + Save Card + T-48h Off-Session Charge — Audit & Implementation Plan

This document maps the current booking + Stripe + Firestore flow and proposes a surgical implementation plan for: **50% deposit now**, **save card for off-session use**, **notify before final charge**, **auto charge remaining 50% at bookingStartAt − 48 hours**, with **no-login manage-booking** links.

---

## A) Current System Map (What Exists Today)

### Booking creation flow (UI → API → DB)

| Step | What happens | Files |
|------|----------------|-------|
| 1. User picks experience/boat, slot, rate, addons, customer details | UI collects data | `BookingModal.tsx`, `BookingCalendar.tsx`, `ExperienceBookingCard.tsx`, `ExperienceCalendarPage.tsx`, `ExperienceCalendarSection.tsx` |
| 2. Create hold | `POST /api/booking/create-hold` — validates slot, computes pricing, writes hold + marks slot `held` | `app/api/booking/create-hold/route.ts` |
| 3a. **Modal flow** | `POST /api/booking/create-payment-intent` → client gets `clientSecret` → Stripe Payment Element in modal → `confirmPayment` → `POST /api/booking/complete-after-payment` | `create-payment-intent/route.ts`, `BookingModal.tsx`, `complete-after-payment/route.ts` |
| 3b. **Redirect flow** | `POST /api/booking/create-checkout-session` (holdId) or `POST /api/booking/create-checkout-session-direct` (no hold first for direct) → redirect to Stripe Checkout → customer pays on Stripe-hosted page | `create-checkout-session/route.ts`, `create-checkout-session-direct/route.ts` |
| 4. Convert hold → booking | Either **webhook** `payment_intent.succeeded` or **client** `complete-after-payment` calls `convertHoldToBooking(db, holdId, { paymentIntentId, amountTotalCents, currency })` | `app/api/stripe/webhook/route.ts`, `lib/booking/convert-hold-to-booking.ts`, `complete-after-payment/route.ts` |
| 5. DB + email | Booking doc created in `bookings/{id}`, slot updated to `booked`, hold set to `converted`; Brevo confirmation email sent | `convert-hold-to-booking.ts`, `lib/booking/brevo.ts` |

**Data model (hold):**  
`holds/{holdId}` — `slotId`, `rateId`, `addonSelections`, `partySize`, `petsCount`, `customerDraft`, `marketingOptIn`, `status` (`active`|`expired`|`converted`), `expiresAt`, `createdAt`, optional `tipCents`, `discountCode`, `discountCents`, `checkoutSessionId` (when redirect flow used). **No Stripe Customer or PaymentMethod stored.**

**Data model (booking):**  
`bookings/{bookingId}` — same trip/customer fields, `customer`, `pricing` (subtotal, tax, fees, totalCents, currency), `status` (`paid`|`canceled`|`refunded`), `stripe: { checkoutSessionId?, paymentIntentId?, amountTotalCents?, currency? }`, `startDateStr`, optional `discountCode`/`discountCents`, `createdAt`. **No `stripeCustomerId`, `paymentMethodId`, or card display fields.**

### Payment flow (Stripe objects used)

| Flow | Stripe object | How it’s created | Card saved? |
|------|----------------|-----------------|-------------|
| **Modal (Payment Element)** | **PaymentIntent** | `create-payment-intent`: `stripe.paymentIntents.create({ amount: totalCents, currency: "usd", automatic_payment_methods: { enabled: true }, metadata: { holdId, slotId, rateId, … } })` — **no** `customer`, **no** `setup_future_usage` | **No** |
| **Redirect (Checkout Session)** | **Checkout Session** → PaymentIntent | `create-checkout-session` / `create-checkout-session-direct`: `stripe.checkout.sessions.create({ mode: "payment", line_items, metadata: { holdId, … }, success_url, cancel_url, … })` — Stripe creates PaymentIntent behind the scene; **no** `customer` or `payment_method_options` for saving | **No** |

- **Checkout:** Used for redirect flows (hosted Stripe Checkout page).
- **PaymentIntent:** Used for modal flow (Payment Element) and implicitly for Checkout; **single one-time charge**, full amount.
- **SetupIntent:** **Not used.**
- **Stripe Customer:** **Not created.** Checkout can collect `customer_email` but we don’t create or attach a Customer; no `customer` on PaymentIntent.

### Where we calculate price/amounts

- **Server:** `lib/booking/pricing.ts` — `computePricing({ rate, addons, currency })` → `subtotalCents`, `taxCents`, `feesCents`, `totalCents`.  
- **Effective rate:** `getEffectiveRatePriceCents(rate, slotStart, holidayDates, weekendDays, friSunDays)` in `create-hold`, webhook, convert, create-checkout-session, create-payment-intent.  
- **Final amount:** `totalCents = pricing.totalCents + tipCents - discountCents` (hold/booking).  
- **Stripe:** Checkout line items built in `lib/booking/stripe-client.ts` (`buildLineItems`); PaymentIntent amount = that same total (modal flow). **Single charge for full total.**

### Where we store booking records in Firestore

- **Collection:** `bookings` (top-level).  
- **Paths:** `bookings/{bookingId}`.  
- **Fields:** See “Data model (booking)” above. Slot is updated at `boats/{boatId}/slots/{slotId}` or `experiences/{experienceId}/slots/{slotId}` to `status: "booked"`, `bookingId`, `holdId` removed.

### Where we store Stripe IDs today

- **Hold:** `checkoutSessionId` (optional, when redirect flow used).  
- **Booking:** `stripe.paymentIntentId`, `stripe.checkoutSessionId`, `stripe.amountTotalCents`, `stripe.currency`.  
- **Events:** `stripeEvents/{eventId}` — `eventType`, `receivedAt`, `status`, `processedAt`, `error`, `outcome`, `holdId`, `bookingId`, `sessionId`, `paymentIntentId`, `amountTotal`, `currency`.  
- **We do not store:** `stripeCustomerId`, `paymentMethodId`, card brand/last4/exp.

### Current webhook handling

- **File:** `app/api/stripe/webhook/route.ts`.  
- **Verification:** `stripe.webhooks.constructEvent(body, sig, stripeWebhookSecret)`.  
- **Idempotency:** `stripeEvents/{eventId}` — transaction to claim event; if doc exists, return 200 and skip.  
- **Events handled:**
  - **`checkout.session.completed`:** Resolves hold, slot, experience/boat/rate/slot, builds booking doc, runs transaction (slot → booked, booking created, hold → converted), sends Brevo confirmation email, upserts Brevo contact if marketingOptIn. Writes result to `stripeEvents/{eventId}`.
  - **`payment_intent.succeeded`:** Reads `holdId` from PI metadata, calls `convertHoldToBooking(db, holdId, { paymentIntentId, amountTotalCents, currency })`; on success writes outcome to `stripeEvents`.  
- **Not handled:** `payment_intent.payment_failed`, `payment_intent.requires_action`, `customer.updated`, `invoice.*`, etc.

### Current notification system

- **Brevo (email):** `lib/booking/brevo.ts` — `sendBookingConfirmationEmail(booking, context)`, `upsertBrevoContact(email, name, phone, listId)`.  
- **Triggered from:**  
  - `convert-hold-to-booking.ts` after writing booking (used by both webhook and `complete-after-payment`).  
  - Webhook `checkout.session.completed` (duplicate path: it also creates booking + sends email inline; so both Checkout and PaymentIntent paths can create booking + send email).  
- **SMS/Twilio:** Not used for booking flow; `config/site.ts` has placeholder `sms` number only.  
- **No “heads up” or “final charge” emails today.**

### Existing scheduling system

- **Cron:** `POST /api/booking/cleanup-holds` — expires old holds, releases slots. Protected by `Authorization: Bearer CRON_SECRET`.  
- **Docs:** `docs/BOOKING_SETUP.md` says call it every 5–10 min (e.g. Vercel Cron); **no `vercel.json` cron** in repo.  
- **No T-48h or “final charge” scheduler.**

---

## B) Gaps vs Required New Flow

| Requirement | Current state | Gap |
|-------------|----------------|-----|
| **50% deposit now** | Full amount charged (PaymentIntent or Checkout) | Need to charge 50% only at checkout; store “deposit” vs “final” amounts and intent. |
| **Save card for off-session use** | No Stripe Customer; no saved PaymentMethod | Must create Stripe Customer and attach PaymentMethod (SetupIntent or `setup_future_usage` on PaymentIntent). |
| **Notify before final charge** | No such email | Need Brevo (or similar) “final charge reminder” at T-48h. |
| **Auto charge remaining 50% at T-48h** | No scheduler for payments | Need a cron/scheduled job that finds bookings with `finalChargeAt ≤ now` and `status = final_scheduled`, then calls Stripe to charge. |
| **payment_intent.succeeded** | Handled; creates booking | Must still create/update booking on deposit success; for 50/50, booking might be created with status `deposit_paid` and later updated to `final_paid`. |
| **payment_intent.payment_failed / requires_action** | Not handled | Needed for final charge failure and “complete payment” link flow. |
| **Scheduler at T-48h** | Only cleanup-holds cron exists | Need new job: e.g. “final-charge” or “scheduled-charges” that runs every N minutes and processes `finalChargeAt`. |
| **Secure “manage booking” without login** | Email “View booking details” links to `/booking/success?session_id=…` or `?payment_intent=…` (receipt view only) | Need signed, time-limited token (e.g. JWT or signed query) that authenticates “this link is for booking X” and allows update card + pay outstanding. No customer login. |

Additional gaps:

- **Firestore booking schema:** No `depositPaymentIntentId`, `stripeCustomerId`, `paymentMethodId`, `cardBrand`/`cardLast4`/`cardExp` (display), `finalChargeAt`, or statuses `deposit_paid`, `final_scheduled`, `final_paid`, `final_failed`, `requires_action`.
- **Idempotency for final charge:** Same booking must not be charged twice; use a single “final charge” PaymentIntent or a clear `finalChargeAttemptedAt` / `finalPaymentIntentId` and webhook to update status.

---

## C) Recommended Architecture for “No Login 50/50”

### Keep Stripe Checkout or move to Payment Element?

- **Recommendation:** Keep **both** flows; extend them for 50/50.
  - **Modal flow (Payment Element):** Already uses PaymentIntent; add Stripe Customer + `setup_future_usage: "off_session"` and charge 50% (deposit). No Checkout.
  - **Redirect flow:** Keep Checkout for users who prefer redirect; use Checkout with `payment_intent_data.setup_future_usage: "off_session"` and `payment_intent_data.amount` = 50% of total (or use a single PaymentIntent for deposit and save the PM). Alternatively, use Checkout in “subscription” or custom “mode” that creates Customer + PM and charges deposit — simplest is **one PaymentIntent for deposit** with `setup_future_usage: "off_session"` and `customer` + `payment_method` attached after payment (Stripe attaches PM to Customer on successful PaymentIntent when `setup_future_usage` is set).
- So: **Payment Element (modal):** Create Customer, create PaymentIntent with `customer`, `amount: depositCents`, `setup_future_usage: "off_session"`; after payment, Stripe attaches the PM to the Customer. **Checkout (redirect):** Use `mode: "payment"` with `payment_intent_data: { setup_future_usage: "off_session", amount: depositCents }` and `customer_email` or create Customer server-side and pass `customer`; Stripe will attach PM to Customer. Either way, **we must create a Stripe Customer** (by email) and pass it into the PaymentIntent or Checkout so the card is saved to that customer.

### Storing Stripe references safely

- **In Firestore (bookings):** Store only non-sensitive IDs and display-only card info:
  - `stripeCustomerId` (Stripe Customer id).
  - `paymentMethodId` (Stripe PaymentMethod id) — needed for off-session charge.
  - `depositPaymentIntentId` (first PaymentIntent = deposit).
  - `cardBrand`, `cardLast4`, `cardExp` (from PaymentMethod or PaymentIntent after success) — display only; **never store raw card.**
- **Final charge:** Create a **new** PaymentIntent for the remaining 50% with `customer`, `payment_method`, `off_session: true`, `confirm: true` (or confirm in code). Store `finalPaymentIntentId` when created; webhook `payment_intent.succeeded` / `payment_intent.payment_failed` updates booking status.

### “Update card” flow (SetupIntent + signed link)

- **Manage booking link:** Generate a signed token (e.g. JWT or HMAC-signed query) containing `bookingId` + expiry (e.g. 30 days). URL: `/booking/manage?token=...`.  
- **Page:** Decode token server-side; if invalid/expired, 404 or “Link expired”. Else load booking, show summary + “Pay remaining” and “Update card”.  
- **Update card:** Call backend `POST /api/booking/manage/update-card` with `token` + optional new payment method from Stripe Elements (or use Stripe Customer Portal if you prefer). Recommended: **SetupIntent** created with `customer: booking.stripeCustomerId`, return `client_secret`; frontend uses Elements to collect new card and confirm SetupIntent; attach new PaymentMethod to Customer and set as default; store new `paymentMethodId` (and last4/brand/exp) on booking in Firestore.  
- **Pay outstanding:** If status is `requires_action` or `final_failed`, show “Pay remaining” button; backend creates PaymentIntent for remaining amount with saved `paymentMethodId`, `off_session: true`, and returns `client_secret` for confirm; or redirect to Checkout for that amount.

### Off-session final charge at T-48h

- **Stored:** `finalChargeAt` (Firestore Timestamp or ISO string) = booking start (from slot) minus 48 hours.  
- **Scheduler:** Cron (e.g. Vercel Cron or external) calls `POST /api/booking/final-charge-run` (or internal function) with `Authorization: Bearer CRON_SECRET`.  
- **Logic:** Query `bookings` where `status === "final_scheduled"` and `finalChargeAt <= now`, limit batch. For each: create PaymentIntent with `customer`, `payment_method`, `amount: finalCents`, `off_session: true`, `confirm: true`, metadata `bookingId`; if confirm throws “requires_authentication”, catch and set status to `requires_action`, send “Complete payment” email with manage link. On success, webhook `payment_intent.succeeded` sets status to `final_paid`. On failure, webhook `payment_intent.payment_failed` sets `final_failed` and send email with manage link.

### Fallback when authentication required

- If Stripe returns that the charge requires authentication (3DS etc.), do **not** retry off-session. Set booking to `requires_action`; send email: “Your card requires verification to complete the remaining balance” with the signed manage-booking link. Customer opens link and completes payment (on-session) via the “Pay remaining” flow.

---

## D) Implementation Plan (Surgical, in order)

### 1. Firestore schema updates

- **Bookings:** Add fields (optional for backward compatibility):  
  `depositPaymentIntentId`, `stripeCustomerId`, `paymentMethodId`, `cardBrand`, `cardLast4`, `cardExp`, `finalChargeAt` (Timestamp or string), `finalPaymentIntentId` (when created), `status` extended with `deposit_paid`, `final_scheduled`, `final_paid`, `final_failed`, `requires_action`.  
  Keep existing `paid` for “legacy” full-paid bookings; new bookings use `deposit_paid` → `final_scheduled` → `final_paid` (or `final_failed` / `requires_action`).
- **Types:** Update `lib/booking/types.ts` — `Booking`, `BookingStatus`, and any admin types.

### 2. Stripe Customer + save card (deposit flow)

- **create-payment-intent (modal):**  
  - Accept a flag or always use 50/50 for new flow (or feature-flag).  
  - Look up or create Stripe Customer by email (e.g. `customers` collection by email or Stripe API `list` by email).  
  - Create PaymentIntent with `amount: depositCents` (50% of total), `customer`, `setup_future_usage: "off_session"`, `metadata: { holdId, ... }`.  
  - Return `client_secret` as today.
- **create-checkout-session / create-checkout-session-direct:**  
  - For 50/50: create Customer, then create Checkout Session with `payment_intent_data: { setup_future_usage: "off_session", amount: depositCents, metadata }` and `customer_email` or `customer`; ensure Stripe attaches PM to Customer (Checkout does this when `setup_future_usage` is set and customer is provided or collected).

### 3. Convert hold → booking (deposit_paid + final_scheduled)

- **convert-hold-to-booking:**  
  - Input: add `depositPaymentIntentId`, optional `stripeCustomerId`, `paymentMethodId`, `cardBrand`, `cardLast4`, `cardExp` (from webhook or from create-payment-intent callback).  
  - Write booking with `status: "deposit_paid"`, `stripe: { depositPaymentIntentId, stripeCustomerId, paymentMethodId, amountTotalCents: depositCents }`, `cardBrand`, `cardLast4`, `cardExp`, `finalChargeAt` = slot start − 48h, and store `pricing` with `depositCents` and `finalCents` (or keep single total and derive 50/50).  
  - After writing booking, set status to `final_scheduled` (or keep `deposit_paid` and have scheduler look for `finalChargeAt` + `deposit_paid`/`final_scheduled`).

### 4. Webhooks

- **payment_intent.succeeded:**  
  - If metadata has `holdId`, call convert as today; in convert, when building booking, if this PI is “deposit” (e.g. amount = half of booking total), write `deposit_paid`, `finalChargeAt`, Stripe Customer/PM/card display fields.  
  - If metadata has `bookingId` (final charge), update booking: `status: "final_paid"`, `stripe.finalPaymentIntentId`, `stripe.finalAmountCents`.  
- **payment_intent.payment_failed:**  
  - New handler: if metadata `bookingId`, set booking `status: "final_failed"` (or `requires_action` if error code indicates authentication required); optionally send “payment failed” email with manage link.  
- **payment_intent.requires_action:**  
  - Optional: set `requires_action` and send email with manage link.

### 5. Scheduler job

- **New route or server function:** e.g. `POST /api/booking/final-charge-run` (cron with CRON_SECRET).  
- Query: `bookings` where `status in ["deposit_paid", "final_scheduled"]` and `finalChargeAt <= now`, limit 50.  
- For each: create PaymentIntent (remaining 50%) with `customer`, `payment_method`, `off_session: true`, `confirm: true`, metadata `bookingId`; on success webhook updates to `final_paid`; on “requires_authentication” set `requires_action` and send email; on other failure set `final_failed` and send email.  
- **Heads-up email:** Either same job or separate: for bookings with `finalChargeAt` in ~24–48h, send “We’ll charge the remaining balance on …” (once per booking, track sent in Firestore).

### 6. Manage booking (signed link + update card + pay remaining)

- **Token:** Sign `bookingId` + expiry (e.g. 30 days) with HMAC or JWT (secret in env).  
- **Route:** `GET /booking/manage?token=...` — validate token, load booking, render “Manage booking” page (trip summary, card last4, “Update card”, “Pay remaining” if applicable).  
- **API:**  
  - `POST /api/booking/manage/update-card` — validate token, create SetupIntent for `booking.stripeCustomerId`, return `client_secret`; on frontend confirm; then backend attaches new default PM and updates Firestore `paymentMethodId`, `cardLast4`, etc.  
  - `POST /api/booking/manage/create-final-payment-intent` — validate token, create PaymentIntent for remaining amount, return `client_secret` for on-session confirm (or redirect to minimal Checkout).  
- **Confirmation email (deposit):** Include “Manage your booking” link with signed token (and mention “We’ll charge the remaining 50% 48 hours before your trip”).

### 7. UI copy and admin

- **Checkout / modal:** Add copy: “50% deposit today; remaining 50% charged 48 hours before your trip. Your card will be saved for the final charge.”  
- **Admin bookings list/detail:** Show `stripeCustomerId`, `paymentMethodId` (masked), card last4/brand/exp, `finalChargeAt`, status (`deposit_paid` / `final_scheduled` / `final_paid` / `final_failed` / `requires_action`). Optionally “Retry final charge” button that calls an admin-only API.

### 8. Backward compatibility

- Existing bookings stay `status: "paid"` with single `paymentIntentId`/`checkoutSessionId`; no `finalChargeAt`.  
- New 50/50 bookings use new statuses and fields. Scheduler and webhooks ignore `paid` and only act on `deposit_paid`/`final_scheduled`.

---

## E) Concrete Next Steps

### Files to open first

1. `lib/booking/types.ts` — extend `Booking`, `BookingStatus`, `stripe` shape.  
2. `app/api/booking/create-payment-intent/route.ts` — add Customer + 50% amount + `setup_future_usage`.  
3. `app/api/booking/create-checkout-session/route.ts` and `app/api/booking/create-checkout-session-direct/route.ts` — add 50/50 + Customer + save PM.  
4. `lib/booking/convert-hold-to-booking.ts` — write new fields and `finalChargeAt`; handle “deposit” vs “full” (by amount or metadata).  
5. `app/api/stripe/webhook/route.ts` — handle `payment_intent.succeeded` (deposit vs final), add `payment_intent.payment_failed` (and optionally `requires_action`).  
6. New: `app/api/booking/final-charge-run/route.ts` (or server action) — cron job.  
7. New: `app/(site)/booking/manage/page.tsx` + `app/api/booking/manage/update-card/route.ts` + `app/api/booking/manage/create-final-payment-intent/route.ts` (or similar).  
8. `lib/booking/brevo.ts` / email templates — “Final charge reminder” and “Complete payment” (with manage link).  
9. Admin: `app/(site)/admin/(dashboard)/bookings/page.tsx` and `app/api/admin/bookings/route.ts` — show new fields and statuses.

### Search queries to find current flow

- `stripe.paymentIntents.create` → `app/api/booking/create-payment-intent/route.ts`  
- `checkout.sessions.create` → `create-checkout-session/route.ts`, `create-checkout-session-direct/route.ts`  
- `convertHoldToBooking` → `lib/booking/convert-hold-to-booking.ts`, `app/api/stripe/webhook/route.ts`, `app/api/booking/complete-after-payment/route.ts`  
- `payment_intent.succeeded` → `app/api/stripe/webhook/route.ts`  
- `sendBookingConfirmationEmail` → `lib/booking/brevo.ts`, `convert-hold-to-booking.ts`, webhook  
- `bookings` collection → `convert-hold-to-booking.ts`, `app/api/admin/bookings/route.ts`  
- `CRON_SECRET` / `cleanup-holds` → `app/api/booking/cleanup-holds/route.ts`

### Phase 1 / Phase 2 / Phase 3 rollout

- **Phase 1 (backend + schema, no customer impact):**  
  - Extend Firestore booking schema and types.  
  - Create Stripe Customer + save PM in create-payment-intent (still charge 100% for now, or feature-flag 50%); convert writes `stripeCustomerId`, `paymentMethodId`, card display, and `finalChargeAt` for new bookings.  
  - Webhook: handle `payment_intent.succeeded` for “final” PaymentIntents (metadata `bookingId`) and update booking to `final_paid`.  
  - Add `payment_intent.payment_failed` handler.  
  - Deploy; do not switch UI to 50% yet.

- **Phase 2 (50% deposit + scheduler + emails):**  
  - Switch create-payment-intent and Checkout to 50% deposit; convert sets `deposit_paid` / `final_scheduled`.  
  - Implement final-charge cron; send “heads up” and “final charge” / “complete payment” emails.  
  - Add manage-booking signed link to confirmation email.

- **Phase 3 (manage booking page + admin):**  
  - Public manage-booking page with token; update card (SetupIntent) and pay remaining (PaymentIntent on-session).  
  - Admin: show new statuses and card info; optional “Retry final charge” for `final_failed` / `requires_action`.

---

## Summary table: current vs new

| Aspect | Current | New (50/50 + save card + T-48h) |
|--------|---------|----------------------------------|
| Stripe Customer | Not created | Create and store `stripeCustomerId` |
| PaymentMethod | Not saved | Save and store `paymentMethodId` + card display |
| Charge at checkout | 100% | 50% (deposit) |
| Booking status | `paid` | `deposit_paid` → `final_scheduled` → `final_paid` (or `final_failed` / `requires_action`) |
| Final charge | N/A | Cron at `finalChargeAt` (T-48h); off-session PI |
| Notifications | Confirmation only | + Heads-up before charge; + “Complete payment” / “Payment failed” with manage link |
| Manage booking | Receipt link only | Signed link: update card (SetupIntent), pay remaining |
| Webhooks | `checkout.session.completed`, `payment_intent.succeeded` | + `payment_intent.payment_failed` (and optionally `requires_action`) |

This keeps existing flows and style, reuses Firestore and Brevo, and adds the minimal set of endpoints, webhook handlers, and scheduler for the 50/50 + save card + T-48h flow with no-login manage links.
