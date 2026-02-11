# BoatBros Custom Booking Engine — Implementation Plan

## Architecture Overview

- **Frontend**: Next.js App Router (`/booking`, `/booking/success`, `/booking/cancel`)
- **Backend**: Next.js API Routes (`/api/booking/*`, `/api/stripe/webhook`)
- **Data**: Firebase Firestore (boats, rates, addons, slots, holds, bookings, stripeEvents)
- **Payments**: Stripe Checkout (v1)
- **Email**: Brevo transactional API

## File-by-File Plan

### 1. Types & Config
- `lib/booking/types.ts` — Firestore document types (Boat, Rate, Addon, Slot, Hold, Booking, etc.)
- `lib/booking/env.ts` — Validate env vars (FIREBASE_*, STRIPE_*, BREVO_*, APP_BASE_URL)
- `.env.example` — Template for required variables

### 2. Firebase
- `lib/booking/firebase-admin.ts` — Initialize Firebase Admin SDK (service account)
- Firestore security: use Admin SDK only on server; no client Firestore

### 3. Stripe
- `lib/booking/stripe.ts` — Stripe client (server-side only)
- Line items built from rate + addons; metadata: holdId, boatId, slotId, rateId

### 4. Brevo
- `lib/booking/brevo.ts` — `sendBookingConfirmationEmail(booking)`, `upsertBrevoContact(email, name, phone, listId?)`
- Template "Booking Confirmation" (create in Brevo dashboard or send HTML via API)

### 5. Pricing
- `lib/booking/pricing.ts` — `computePricing(boatId, rateId, addonSelections)` → subtotal, tax, fees, total (all cents)

### 6. API Routes
- `app/api/booking/create-hold/route.ts` — Validate slot open, party/pets, create hold + set slot held, return holdId, expiresAt, pricing
- `app/api/booking/release-hold/route.ts` — Release hold (GET/POST); cancel page calls it so slot is released immediately
- `app/api/booking/create-checkout-session/route.ts` — Load hold, create Stripe Checkout Session, return url
- `app/api/stripe/webhook/route.ts` — Verify signature, idempotency, on checkout.session.completed: finalize booking, send Brevo email, update Brevo list if opt-in
- `app/api/booking/receipt/route.ts` — GET ?session_id= → Stripe session → booking doc → return details
- `app/api/booking/cleanup-holds/route.ts` — Cron or on-demand: find expired holds, release slots

### 7. Frontend
- `app/(site)/booking/page.tsx` — Calendar + slot picker + duration + addons + customer form + cancellation checkbox → create-hold → create-checkout-session → redirect
- `app/(site)/booking/success/page.tsx` — Read session_id, call /api/booking/receipt, show confirmation
- `app/(site)/booking/cancel/page.tsx` — Calls release-hold when holdId in URL; link back to /booking
- `components/booking/*` — Calendar, SlotPicker, DurationStep, AddonsStep, CustomerForm, HoldCountdown

### 8. Seeds
- `scripts/seed-booking.ts` or `lib/booking/seed.ts` — Seed one boat, rates (3–8h), addons, sample open slots (next 14 days)

### 9. README
- Update README or add `docs/BOOKING_SETUP.md`: env vars, Stripe CLI webhook, Firebase emulator (optional), how to run seed

---

## Flow Summary

1. User visits `/booking` → sees calendar, picks day → sees time chips (from Firestore slots where status=open), picks time → picks duration (3–8h) → addons → customer name/email/phone + marketing opt-in + cancellation checkbox.
2. User clicks "Book Now" → POST create-hold → POST create-checkout-session → redirect to Stripe Checkout.
3. User pays on Stripe → redirect to /booking/success?session_id=...
4. Stripe webhook fires → checkout.session.completed → transaction: slot → booked, create booking doc, hold → converted, send Brevo email, Brevo list if opt-in.
5. Success page: GET /api/booking/receipt?session_id=... → display booking details.
