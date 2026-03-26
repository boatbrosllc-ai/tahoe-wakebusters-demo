# Runbook: `final_charge_missing_stripe_data`

Use this when the cron emits `final_charge_missing_stripe_data` for `final_due` bookings.

## What it means

- A booking is due for final charge, but one or more required Stripe fields are missing:
  - `stripe.customerId`
  - `stripe.paymentMethodId`
  - or computed final balance is non-positive

## Recovery steps

1. Open the booking from the alert `bookingId` and verify `status === "final_due"`.
2. If `stripe.customerId` is missing:
   - Check `stripeCustomerIndex/{customer.email.toLowerCase()}`.
   - Verify candidate IDs against Stripe (customer exists, email matches).
   - If no index row exists, use Stripe dashboard/API search by email and confirm the correct customer.
   - Write `stripe.customerId` to the booking.
3. If `stripe.paymentMethodId` is missing:
   - Confirm the deposit PaymentIntent or Checkout Session saved a reusable card on that customer.
   - If reusable PM exists, write `stripe.paymentMethodId` to the booking.
   - If no reusable PM exists, send customer to manage link to pay remaining with Payment Element.
4. Recompute/verify remaining balance fields:
   - `stripe.totalAmountCents`, `stripe.depositAmountCents`, `stripe.finalAmountCents`
   - Ensure remaining balance is positive.
5. Leave booking `status` as `final_due` and allow next cron run to retry automatically.

## Escalation

- If customer/PM cannot be verified safely, do **not** force-charge.
- Add an operational note and contact customer for a new payment method via manage link.
