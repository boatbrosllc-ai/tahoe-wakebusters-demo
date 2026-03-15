# Email accuracy: money, time, and data

All transactional emails (confirmation, reminders, final payment request, cancellation) must show **correct amounts, dates, and times**. This doc summarizes how we keep them accurate.

## Money (amounts)

- **Storage**: All amounts are stored in **cents** (e.g. $175.00 → `17500`). Never store dollars.
- **Display**: Use **`formatMoney(cents)`** from `lib/booking/format-money.ts` whenever showing a dollar amount in emails or UI. This avoids ever showing cents as dollars (e.g. $4247.50 instead of $175.00).
- **Confirmation email**:
  - **Source of truth**: `stripe.totalAmountCents ?? booking.pricing.totalCents` (Stripe reflects actual charges).
  - Both the inline HTML and Brevo template params use this same source and `formatMoney()`.
- **Brevo template**: If you use a Brevo dashboard template, use the **formatted** params:
  - `totalPaid` – total paid/booking value (e.g. `"$175.00"`)
  - `depositPaidFormatted` – deposit amount when deposit flow
  - `remainingFormatted` – remaining balance when deposit flow  
  Do **not** use a raw-cents variable in the template; always use these pre-formatted strings.

## Date and time

- **Timezone**: All booking dates/times are shown in **America/Chicago** (Austin). Use:
  - `formatBookingDateTime()`, `formatBookingTime()`, `formatSlotDateTime()` from `lib/booking/format-booking-datetime.ts`
  - Or `toLocaleDateString` / `toLocaleTimeString` with `timeZone: "America/Chicago"`.
- **Source**: Trip date/time comes from the booking’s `slotId` via `parseSlotId()` and `getSlotStartEnd()` so the email matches what the customer booked.

## Ticketed (per-ticket) pricing

- For **ticketed** experiences (e.g. sunset cruise), price is **per ticket**. When recomputing pricing (e.g. hold missing `pricing`), we pass **`qty: partySize`** into `computePricing()` so the total is `priceCents × partySize` (+ tax/addons). This is done in:
  - `convert-hold-to-booking.ts` (when recomputing from hold)
  - `create-payment-intent` (when recomputing from hold)

## Files to touch when changing email content

- **Confirmation HTML**: `lib/booking/email-templates.ts` – `renderBookingConfirmationHtml()`
- **Confirmation Brevo params**: `lib/booking/brevo.ts` – `sendBookingConfirmationEmail()`
- **Reminders (1-week, 24h, day-of)**: `lib/booking/reminder-emails.ts`; cron builds params in `app/api/booking/reminder-cron/route.ts`
- **Final payment request**: `lib/booking/reminder-emails.ts` – `buildFinalPaymentRequestHtml()`; amount from `formatMoney(finalCents)` in `app/api/booking/final-payment-reminder-cron/route.ts`
- **Cancellation**: `lib/booking/brevo.ts` – `sendBookingCancellationEmail()`; refund amount from `formatMoney(totalCents)` in `app/api/admin/bookings/[id]/cancel/route.ts`
