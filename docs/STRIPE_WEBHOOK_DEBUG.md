# Stripe webhook – why charge in Stripe but no booking in admin

If a charge appears in Stripe but the booking does **not** show up in Admin → Bookings, the webhook either never ran or ran but did not create a booking.

## 1. Check Stripe webhook delivery

1. **Stripe Dashboard** → **Developers** → **Webhooks** → select your endpoint (e.g. `https://yourdomain.com/api/stripe/webhook`).
2. Open **Recent deliveries** and find the **payment_intent.succeeded** event for that charge.
3. Check:
   - **Response code**: `200` = handler ran; `4xx`/`5xx` = failure (see response body).
   - **Response body**: empty or `{"received":true}` = normal; any `error` message = failure reason.
   - If there is **no** delivery for `payment_intent.succeeded`, the event is not being sent to this endpoint (wrong URL or event not subscribed).

## 2. Check Firestore `stripeEvents`

Each Stripe event is stored in Firestore collection **`stripeEvents`** with document ID = Stripe event ID (e.g. `evt_xxx`).

- **If the event exists**:
  - `error`: e.g. `"Hold not found"`, `"Missing holdId in metadata"`, `"Hold already converted"` → webhook ran but could not create a booking (see below).
  - `outcome: "booking_created"`, `bookingId`, `holdId` → booking was created; you can look up that `bookingId` in the `bookings` collection.
- **If the event does not exist**: the webhook either was not called or failed before claiming the event (e.g. signature verification failed, or 500 before writing to Firestore).

## 3. Common causes

| Symptom | Likely cause |
|--------|---------------|
| No delivery in Stripe for `payment_intent.succeeded` | Webhook URL wrong, or event not subscribed; or local dev without Stripe CLI. |
| Delivery returns 400 (signature) | `STRIPE_WEBHOOK_SECRET` does not match the endpoint’s signing secret (e.g. CLI vs Dashboard). |
| Delivery returns 500 | Server error; check server logs for `[stripe-webhook]`. |
| Delivery 200 but `stripeEvents` has `error: "Hold not found"` | Hold was created in a different environment (e.g. hold on localhost, webhook on production = different DB). Or hold expired and was removed. |
| Delivery 200 but `stripeEvents` has `error: "Missing holdId in metadata"` | PaymentIntent was created without `metadata.holdId` (e.g. old flow or wrong API). |

## 4. Local development

Stripe cannot call `localhost` directly. Use the Stripe CLI to forward events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the **webhook signing secret** printed by the CLI (e.g. `whsec_xxx`) in `.env.local` as `STRIPE_WEBHOOK_SECRET`. Create the hold and complete payment on the same app (localhost) so the webhook and the app use the same Firebase project.

## 5. Production

- Webhook URL must be your live base URL, e.g. `https://yourdomain.com/api/stripe/webhook`.
- In Stripe Dashboard → Webhooks → your endpoint → **Events to send**, ensure **payment_intent.succeeded** (and optionally **payment_intent.payment_failed**) are selected.
- The webhook runs in the same environment as your app; the hold must exist in the **same** Firestore project (the one your production app uses).

## 6. Server logs

The webhook logs:

- `[stripe-webhook] payment_intent.succeeded` with `eventId`, `holdId`, `paymentIntentId` when the event is handled.
- `[stripe-webhook] payment_intent.succeeded booking created` with `bookingId`, `holdId` when a booking is created.
- `[stripe-webhook] payment_intent.succeeded hold not found` (or similar) when it exits early with an error.

Check your hosting logs (Vercel, etc.) for these lines around the time of the charge.
