# Email accuracy: money, time, and data

All transactional emails (confirmation, reminders, final payment request, cancellation) must show **correct amounts, dates, times, and deposit vs full payment**. This doc summarizes how we keep them accurate.

## Accuracy guarantee (summary)

| Email | Time source | Money source | Deposit vs full |
|-------|-------------|--------------|-----------------|
| **Confirmation** | Slot (convert-hold or resend: `parseSlotId` + `getSlotStartEnd` + `formatSlotDateTime` / `formatBookingDateTime`) | `booking.stripe` + `booking.pricing`; display via `formatMoney()` | `context.isDeposit` (from convert-hold) **or** `isDepositFromBookingStripe(booking)` (status + amount fallback). Never shows "Total paid (full payment)" for a deposit. |
| **Reminders (1w, 24h, day-of)** | Same: `booking.slotId` → `parseSlotId` + `getSlotStartEnd`; trip date/time in America/Chicago | (No money in reminder body) | N/A |
| **Final payment request** | Same: `booking.slotId` → slot start in America/Chicago | `booking.stripe.finalAmountCents` → `formatMoney()` | Only sent for `final_due`; amount is remaining balance only. |
| **Final charge failed** | (No time in body) | (No amount in body; CTA to manage booking) | N/A |
| **Cancellation** | Optional trip date from cancel API | Refund from cancel API (`formatMoney`) | N/A |

All of the above use **server-side data only** (Firestore booking/slot/experience, or Stripe metadata at completion). No client-supplied values are used for displayed time or money.

## Money (amounts)

- **Storage**: All amounts are stored in **cents** (e.g. $175.00 → `17500`). Never store dollars.
- **Display**: Use **`formatMoney(cents)`** from `lib/booking/format-money.ts` whenever showing a dollar amount in emails or UI. This avoids ever showing cents as dollars (e.g. $4247.50 instead of $175.00).
- **Confirmation email**:
  - **Source of truth**: `booking.stripe` (totalAmountCents, depositAmountCents, finalAmountCents) with fallback to `booking.pricing.totalCents`. Stripe reflects actual charges.
  - Deposit vs full: `isDepositFromBookingStripe(booking)` (status in deposit flow **or** depositAmountCents &lt; total) and/or `context.isDeposit` from convert-hold. Inline HTML and Brevo params both use the same rule so wording is never wrong.
  - Both the inline HTML and Brevo template params use this same source and `formatMoney()`.
- **Brevo template**: If you use a Brevo dashboard template, use the **formatted** params:
  - `totalPaid` – total booking value (e.g. `"$320.00"`). Do **not** use this as "amount paid today" for deposit; use `amountPaidNowFormatted`.
  - `amountPaidNowFormatted` – **use this** for "You paid X" (deposit amount when `isDeposit` is true, full total when false).
  - `depositPaidFormatted` – deposit amount when deposit flow
  - `remainingFormatted` – remaining balance when deposit flow
  - `isDeposit` – boolean; branch your template on this so deposit emails never say "total paid full amount".
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
