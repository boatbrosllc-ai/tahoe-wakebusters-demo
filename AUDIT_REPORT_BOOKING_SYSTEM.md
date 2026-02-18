# Production-Readiness Audit: Boat Rental Booking System

**Audit type:** Forensic end-to-end  
**Scope:** Frontend booking creation → API → Firestore → Calendar → Admin → Waiver → Payments  
**Date:** 2025  
**Instruction:** No code was modified; findings only.

---

# 1. SYSTEM ARCHITECTURE MAP

## Booking lifecycle (customer path)

| Stage | File(s) | Function / API | Firestore / Next |
|-------|--------|----------------|------------------|
| **Frontend: choose experience & slot** | `components/site/BookingModal.tsx` | User selects experience, duration, date, time, boat (if any), party size → `createHold()` | — |
| **Create hold** | `components/site/BookingModal.tsx` (and others) | `fetch("/api/booking/create-hold", { body })` | — |
| **Hold API** | `app/api/booking/create-hold/route.ts` | `POST` validates slot, pricing, writes hold, marks slot `held` | `holds/{holdId}`, `boats/{boatId}/slots/{slotId}` or `experiences/{expId}/slots/{slotId}` |
| **Checkout** | Same modal / `ExperienceCalendarSectionView` | `fetch("/api/booking/create-checkout-session", { holdId })` or `create-checkout-session-direct` | — |
| **Stripe** | `app/api/booking/create-checkout-session/route.ts` or `create-checkout-session-direct/route.ts` | Create Stripe Session / PaymentIntent, redirect or return client_secret | — |
| **Payment success** | Stripe → webhook or client | `POST /api/stripe/webhook` (checkout.session.completed or payment_intent.succeeded) | — |
| **Webhook: full payment** | `app/api/stripe/webhook/route.ts` | Inline: create booking doc, update slot to `booked`, create waiver, send email | `bookings/{bookingId}`, slot ref, `waiverRequests`, `stripeEvents` |
| **Webhook: deposit** | Same file | `payment_intent.succeeded` → `convertHoldToBooking()` | Same + hold status `converted` |
| **Convert hold → booking** | `lib/booking/convert-hold-to-booking.ts` | `convertHoldToBooking(db, holdId, input)` | `bookings/{bookingId}`, slot update, hold `converted`, waiver creation, Brevo email |
| **Client fallback** | `app/api/booking/complete-after-payment/route.ts` | If webhook delayed: same `convertHoldToBooking()` | Same as above |

## Calendar display (public)

| Stage | File(s) | Reads |
|-------|--------|-------|
| **Slots API** | `app/api/booking/slots/route.ts` | `experiences/{id}`, `boats` (by experienceIds), `bookings` (experienceId + slug variants), `boats/{id}/slots`, `blocks`, `holds` |
| **Frontend calendar** | `components/experience/ExperienceCalendarSection.tsx` + `ExperienceCalendarSectionView.tsx` | GET `/api/booking/slots?experienceId=&startDate=&endDate=` |
| **Date/prices** | `app/api/booking/date-prices/route.ts` | Experience rates, optional calendar overrides |

## Admin

| Stage | File(s) | Reads / Writes |
|-------|--------|----------------|
| **Bookings list** | `app/api/admin/bookings/route.ts` | `bookings` (orderBy createdAt or startDateStr range), experiences, boats, addons for names |
| **Booking detail** | `app/api/admin/bookings/[id]/route.ts` | `bookings/{id}`, experiences, boats, addons |
| **Cancel booking** | `app/api/admin/bookings/[id]/cancel/route.ts` | Read booking, slot; transaction: booking status `canceled`, slot `open` |
| **Calendar events (week view)** | `app/api/admin/calendar-events/route.ts` | `bookings` (experienceId + status in), `blocks`, `boats` for names |
| **Admin UI** | `app/(site)/admin/(dashboard)/bookings/page.tsx`, calendars, etc. | Uses above APIs |

## Waiver

| Stage | File(s) | Firestore |
|-------|--------|-----------|
| **On booking created** | `lib/waiver/on-booking-created.ts` | `createRequest()` → `waiverRequests`, `waiverSigningTokens`; `setBookingWaiverPointer()` → `bookings/{id}.waiver` |
| **Signing** | `app/api/waiver/signing/submit/route.ts` | `updateRequestSigned()`, `setBookingWaiverPointer(..., status: "signed")` (primary token only), `markTokenUsed()` |
| **Waiver tracking** | `app/api/admin/waiver-requests/route.ts` | `waiverRequests` (list), `bookings` for summary |
| **Validate link** | `app/api/waiver/signing/validate/route.ts` | Tokens, requests, booking |

## Payment reconciliation / final charge

| Stage | File(s) | Notes |
|-------|--------|-------|
| **Run final charges** | `app/api/booking/run-final-charges/route.ts` | Uses `finalChargeAt`, creates PaymentIntent (metadata `bookingId`, `payment_stage: final`) |
| **Webhook** | `app/api/stripe/webhook/route.ts` | `payment_intent.succeeded` with `payment_stage: final` → update booking `final_paid`; `payment_failed` → `final_failed` / `final_requires_action`, email |

---

# 2. FIRESTORE SCHEMA AUDIT

## Collections identified

| Collection | Purpose | Key fields (actual usage) |
|------------|---------|----------------------------|
| **bookings** | One doc per paid booking | `experienceId`, `boatId`, `slotId`, `startDateStr`, `rateId`, `addonSelections`, `partySize`, `petsCount`, `customer`, `pricing`, `status`, `stripe`, `waiver` (requestId, status, templateId, templateVersion), `createdAt`, `finalChargeAt`, reminder sent timestamps, `discountCode`, `discountCents`, `card` |
| **holds** | Temporary hold while user checks out | `experienceId`, `boatId`, `slotId`, `rateId`, `addonSelections`, `partySize`, `petsCount`, `customerDraft`, `status`, `expiresAt`, `createdAt`, `pricing`, `effectiveRateCents`, `checkoutSessionId`, `tipCents`, `discountCode`, `discountCents` |
| **boats** | Boat definitions; listing boats have `experienceIds` | `name`, `active`, `isListingBoat`, `experienceIds`, etc. Subcollections: `slots`, `rates`, `addons` (legacy). |
| **experiences** | Experience definitions | `slug`, `title`, `active`, etc. Subcollections: `rates`, `addons`; slots live under **boats** for listing-boat flow. |
| **boats/{id}/slots** | Slot docs for listing-boat flow | `startAt`, `endAt` (Timestamp), `status` (open | held | booked | blocked), `holdId`, `bookingId`, `updatedAt` |
| **experiences/{id}/slots** | Used only for experience-only (no boat) flow | Same shape as above. |
| **blocks** | Admin block dates/times | `experienceId`, `boatId?`, `startAt`, `endAt`, `note` |
| **waiverTemplates** | Waiver terms and config | `title`, `termsHtml`, `isActive`, `version`, etc. |
| **waiverRequests** | One per signer/booking link | `bookingId`, `templateId`, `templateVersion`, `status`, `signingTokenId`, `signingUrl`, `sent`, `signed`, `createdAt` |
| **waiverSigningTokens** | One-time token for primary link | `waiverRequestId`, `bookingId`, `expiresAt`, `usedAt` |
| **waiverGroupTokens** | Shareable link for party | `bookingId`, `templateId`, `templateVersion`, etc. |
| **stripeEvents** | Webhook idempotency and audit | `eventId`, `receivedAt`, `status`, `processedAt`, `error`, `outcome`, `bookingId`, `holdId`, etc. |
| **discounts** | Discount codes | `code`, `type`, `usedCount`, etc. |
| **emailLog** | Optional log of sent emails | — |

## Schema consistency and gaps

- **bookingId**: Present as document id; no separate `bookingId` field. Consistent.
- **boatId / experienceId**: Both optional on booking; for listing flow both set. **Risk:** Some legacy or alternate paths may store `experienceId` as slug (`"pontoon"`, `"lake-austin-pontoon"`) vs Firestore doc id; slots API now queries slug variants; admin calendar-events does **not** (see Calendar section).
- **start / end**: Not stored as top-level booking fields. Start/end derived from `slotId` via `parseSlotId` + `getSlotStartEnd()`. Slot docs store `startAt`/`endAt` as Firestore **Timestamp**. Consistent.
- **durationHours**: Not on booking doc; derived from `slotId` (and rate). Acceptable.
- **price snapshot**: Booking has `pricing: { subtotalCents, taxCents, feesCents, totalCents, currency }`. No separate `pricePerHour`; total and components are stored. **Pricing integrity:** See Section 5.
- **status**: Booking uses `BookingStatus`; slot uses `open` | `held` | `booked` | `blocked`. Consistent.
- **waiverStatus**: On booking as `waiver.status` (pending | signed, etc.). Waiver request has `status`; booking pointer updated on primary sign. **Gap:** For group signers, new requests are created and marked signed but **booking.waiver is not updated** (only primary token path updates it). Admin may show waiver "pending" while multiple party waivers are signed.
- **waiverSentAt / waiverSignedAt**: Not top-level on booking. Waiver request has `sent.initialSentAt`, `sent.lastSentAt`, `signed.signedAt`. Booking has `waiver.requestId`; admin can resolve from waiverRequests.
- **waiverUrl**: Stored as `signingUrl` on waiver request; not duplicated on booking.
- **captainId / captainStatus**: **Not present.** No captain assignment or storage in schema. Copy refers to "captain" only; no per-booking captain tracking.
- **createdAt / updatedAt**: Booking has `createdAt` (Timestamp). No `updatedAt` on booking; slot has `updatedAt`. Admin updates (e.g. cancel) do not set an `updatedAt` on the booking.

## Duplicate / conflicting storage

- **Slot state**: "Booked" is enforced by (1) slot doc `status: "booked"`, `bookingId`, and (2) bookings collection as source of truth in slots API. Slots API prefers bookings over slot doc for "booked" to avoid stale slot docs. Consistent.
- **Experience slug vs id**: Bookings may be written with `experienceId` = Firestore id or slug (e.g. from different clients). Slots API now merges by doc id and slug variants for pontoon; admin calendar-events and admin list filter by single `experienceId` (doc id only) — **bookings stored with slug will not appear in admin calendar when filtering by experience doc id.**

---

# 3. DATE AND TIMEZONE AUDIT (CRITICAL)

## Where dates originate and how they’re stored

- **Frontend date selection**: User picks a calendar date (local or app timezone). Component builds `slotId` as `YYYY-MM-DD-startHour-durationHours` (e.g. `2026-02-15-10-4`). Hour is **business hour in America/Chicago** (7–19); see `lib/booking/experience-slots.ts`.
- **Slot doc**: `startAt` and `endAt` are Firestore **Timestamp** (set from `getSlotStartEnd(dateStr, startHour, durationHours)` which uses Central offset). Correct.
- **Booking**: No `start`/`end` fields. `startDateStr` is set from `parseSlotId(hold.slotId).dateStr` (YYYY-MM-DD string). All start/end display uses `getSlotStartEnd()` + `formatBookingTime` / `formatBookingDateTime` with **America/Chicago**.
- **Slots API**: Returns `startAt`/`endAt` as **ISO strings** (from Timestamp.toDate().toISOString()). Client can parse with `new Date(iso)`; display uses `formatBookingTimeFromIso(iso)` which uses America/Chicago. Consistent.
- **getSlotStartEnd**: Uses `dateStr` (YYYY-MM-DD) and **hour in Central**; converts to UTC Date for storage. DST handled in `getCentralOffsetHoursForDate()`. Correct for Austin.

## String-based date usage

- **startDateStr** on booking: Stored as YYYY-MM-DD string for **filtering** (admin trip date range). Not used for time-of-day. Acceptable.
- **Range params**: APIs use `startDate`/`endDate` as YYYY-MM-DD strings; converted to `Date` with `T00:00:00` or `T23:59:59` (local interpretation). Server may be UTC; slot logic uses Central for business meaning. **Risk:** Any range query that uses `new Date(dateStr + "T00:00:00")` without timezone is interpreted as **server local** (or UTC if no TZ). In practice, slot grid and booking dates are built from date-only strings and Central hours, so day boundaries are correct for Austin as long as server and clients agree on the calendar day. Document that `startDate`/`endDate` are **date-only** (no timezone) and used for day boundaries.

## Timezone corruption risks

1. **getSlotGrid** uses `new Date(startDate)` and `d.setDate(d.getDate() + 1)` for iteration — uses **server local** for date iteration. If server is UTC, a UTC midnight boundary could shift the “day” vs Austin. **Recommendation:** Iterate using Central date (e.g. `getDateStrInSlotTimezone`) or explicit YYYY-MM-DD strings to avoid DST/midnight boundary issues.
2. **formatBookingTime(ts.toDate())**: Uses America/Chicago. Correct.
3. **Slots API** `start`/`end` for query: Built as `new Date(startDate + "T00:00:00")` — **interpreted as local (or UTC)**. Firestore Timestamp comparison is UTC. For slot start/end stored in UTC (from Central), day range should still be correct; document intent.

---

# 4. BOOKING CREATION FLOW AUDIT

## Where bookings are created

1. **Stripe webhook** (`checkout.session.completed`): Creates booking inline in one transaction with slot update and hold update. Single write to `bookings/{bookingId}`.
2. **Stripe webhook** (`payment_intent.succeeded` for deposit/full): Calls `convertHoldToBooking()`. Creates one booking doc inside that flow.
3. **Client** `complete-after-payment`: Calls `convertHoldToBooking()` with same holdId. Idempotent: if hold already `converted`, returns `{ alreadyConverted: true }` and does not create a second booking.

## Idempotency and duplicate prevention

- **Webhook**: `stripeEvents` collection keyed by Stripe event id. Transaction claims event; if doc exists, returns 200 and does nothing. Prevents duplicate processing of same webhook.
- **convertHoldToBooking**: First checks `hold.status !== "active"`; if not active (e.g. already `converted`), returns `{ alreadyConverted: true }` without writing. Prevents double conversion.
- **create-hold**: Within a transaction, slot is read; if not `open` (or held by another hold), throws "Slot no longer available". Prevents two holds on same slot. Booking creation is not in create-hold; it is only in webhook and convert.

## BookingId uniqueness

- New booking id: `db.collection("bookings").doc().id` (Firestore auto-id). Unique.

## Race conditions

- **Two users, same slot**: First create-hold wins and marks slot `held`; second create-hold sees slot not open and returns 409. Handled.
- **Webhook and complete-after-payment both run**: First to run converts hold and sets `hold.status = "converted"`; second sees hold not active and returns alreadyConverted. Handled.
- **Two webhook deliveries** (e.g. retry): Event id claimed in transaction; second attempt sees existing doc and skips. Handled.

## Server-side validation

- create-hold: Validates body (experienceId or boatId, slotId, rateId, partySize, petsCount, customerDraft), capacity, seasonal rules, slot existence and overlap with existing bookings/holds. Pricing computed server-side.
- Webhook: Validates hold exists, slot held by this hold, then creates booking from hold + session/PM data.
- convertHoldToBooking: Validates hold exists and is active, slot held by this hold, then writes booking.

---

# 5. PRICING INTEGRITY AUDIT

- **Hold**: At create-hold, pricing is computed and stored on the hold: `pricing: { subtotalCents, taxCents, feesCents, totalCents, currency }`, and `effectiveRateCents`. Checkout and webhook use **hold.pricing** when present; otherwise recompute (webhook path). Recompute could theoretically differ if rate/date logic changed; hold.pricing is the intended snapshot.
- **Booking (full payment, webhook)**: Uses `hold.pricing` if present; else computes from rate + addons. Final total includes tip and discount from hold. Booking doc stores `pricing: finalPricing`. Snapshot is stored.
- **Booking (convertHoldToBooking)**: Uses `computePricing()` from rate and addons; rate price can be adjusted by `getEffectiveRatePriceCents` for weekend/holiday. Booking stores this `pricing`. So booking always has a server-computed snapshot at conversion time.
- **No pricePerHour on booking**: Only total and components. Acceptable; total is what matters for reconciliation.
- **Risk**: If webhook path ever skipped `hold.pricing` and recomputed with different env (e.g. different holiday list), total could drift. Code prefers hold.pricing when present. **Recommendation:** Always persist pricing on hold and always use it in webhook/convert; avoid recompute in payment path.

---

# 6. CALENDAR INTEGRITY AUDIT

- **Slots API** (`/api/booking/slots`): Reads bookings by `experienceId` (doc id) and by slug variants (`pontoon`, `lake-austin-pontoon`) when applicable. Merges into `existingByBoatAndKey` and marks slots as booked. Builds grid from `getSlotGrid(start, end, durationsUnique)` and fills in open/held/booked/blocked. Returns slots with `startAt`/`endAt` as ISO strings, `dateStr`, `status`, `boatId`, `experienceId`.
- **Calendar display**: Frontend uses returned slot list; dates/times from ISO. No direct Firestore read; no cache. Correct.
- **Admin calendar-events** (`/api/admin/calendar-events`): Queries `bookings` with `experienceId == experienceId` (single value). **Does not** query by slug. So if some bookings have `experienceId: "pontoon"` or `"lake-austin-pontoon"`, they **will not** appear in the admin calendar when filtering by experience doc id. **Bug / inconsistency:** Same as slots API fix (slug variants); calendar-events should include slug-variant queries for pontoon (or generic by experience slug) so all relevant bookings show.
- **startDateStr**: Admin list uses `startDateStr` for trip date range when index exists; otherwise falls back to full scan + filter. Slots API uses `parsed.dateStr` from slotId for booking merge; no dependency on booking.startDateStr for calendar grid. Consistent for display.

---

# 7. ADMIN BOOKING MODAL AUDIT

- **Data source**: Admin booking detail comes from `GET /api/admin/bookings/[id]` which reads `bookings/{id}` once and enriches with experience/boat/addon names. No real-time listener; **not live** Firestore. Refresh required to see updates.
- **Display**: Date/time from `slotId` via `parseSlotIdForDisplay` and `getSlotStartEnd`; pricing from `b.pricing`; waiver from `b.waiver`. Correct.
- **Writes**: Cancel is via `POST /api/admin/bookings/[id]/cancel` which updates booking status and slot in a transaction. No generic “edit booking” that overwrites fields; cancel only touches `status` and slot. **Overwrite risk:** Low for cancel. If a future “edit booking” feature is added, it must do targeted updates and not replace the whole document with client-supplied data.

---

# 8. WAIVER SYSTEM AUDIT

- **waiverStatus**: On booking as `waiver.status` (e.g. pending, signed). Set at creation to "pending" and updated to "signed" when primary signing link is used in `app/api/waiver/signing/submit/route.ts`.
- **waiverSentAt**: Not on booking. Waiver request has `sent.initialSentAt`, `sent.lastSentAt`. Resolvable via `waiver.requestId` → waiverRequests.
- **waiverSignedAt**: Not on booking. Waiver request has `signed.signedAt`. Same resolution.
- **waiverUrl**: Stored as `signingUrl` on waiver request. Not duplicated on booking; link is in email and request.
- **Link to booking**: `waiverRequests.bookingId` and `bookings.{id}.waiver.requestId`. Bidirectional. Correct.
- **Orphan risk**: If booking is created but waiver creation fails (e.g. no active template), booking has no `waiver` field. Admin may show “no waiver”; no orphan waiver request for that booking. If waiver request is created but `setBookingWaiverPointer` fails, waiver request exists without booking pointer — **orphan request**. Current code runs pointer update after request create; one failure path could leave inconsistency. **Recommendation:** Consider transaction or retry for createRequest + setBookingWaiverPointer.
- **Group signers**: Each group sign creates a **new** waiver request. Booking’s `waiver` points to the **primary** request only. When a group member signs, we do **not** update `booking.waiver.status`. So booking can still show "pending" while multiple party waivers exist and are signed. **Design gap:** Either update booking.waiver when any request for that booking is signed (e.g. “partially_signed”) or expose “signed count” from list of requests by bookingId.

---

# 9. CAPTAIN ASSIGNMENT AUDIT

- **captainId / captainStatus**: **Not implemented.** No fields on booking or elsewhere for captain assignment or status. Copy and UI refer to “captain” only. No assignment logic, no storage. **Production impact:** Operational assignment (who drives which trip) is outside the current system; may be manual or in another tool.

---

# 10. STATE MACHINE AUDIT

## Booking status values

- `paid`, `canceled`, `refunded`, `deposit_paid`, `final_due`, `final_processing`, `final_paid`, `final_requires_action`, `final_failed`.

## Intended transitions

- Created: `paid` (full) or `final_due` (deposit).
- Deposit: `final_due` → `final_processing` (charge attempted) → `final_paid` or `final_requires_action` or `final_failed`.
- Admin cancel: any → `canceled`. Refund: any → `refunded` (manual or future).

## Unsafe or illegal transitions

- No state machine enforcement in code. Admin cancel route sets `status: "canceled"` without checking current status (it does skip if already canceled/refunded). So double-cancel is no-op. Setting a booking back to `paid` or `final_due` manually in Firestore would be possible but is not exposed in UI. **Recommendation:** Document allowed transitions and, if needed, add guards (e.g. only allow cancel from paid/final_due/final_paid).

## Hold status

- `active` → `converted` (after booking created). No other states used in logic. Expired holds are not auto-updated to a separate status; slots API treats expired hold slots as open by re-checking hold doc.

---

# 11. DUPLICATE AND IDEMPOTENCY AUDIT

- **Webhook**: Event id in `stripeEvents` prevents duplicate handling. Confirmed.
- **convertHoldToBooking**: Hold status check prevents double conversion. Confirmed.
- **create-hold**: Slot status + overlap check prevent double hold on same slot. Confirmed.
- **complete-after-payment**: Same convert path; idempotent. Confirmed.
- **Direct checkout** (`create-checkout-session-direct`): Creates PaymentIntent and can create a hold in same flow. If user double-clicks, two holds could be created for same slot unless UI disables button. **Recommendation:** Button disable or idempotency key (e.g. slotId+date+clientId) to reduce double submission.

---

# 12. SECURITY AUDIT

- **Admin**: `requireAdminSession()` on admin APIs; session from Firebase Auth. Protects bookings, calendar-events, waiver-requests, cancel, etc.
- **Stripe webhook**: Signature verified with `stripe.webhooks.constructEvent(body, sig, secret)`. Rejects tampered or wrong endpoint.
- **Client cannot set critical booking fields**: Booking is created only server-side (webhook, convert). Client sends holdId or paymentIntentId; no direct booking create/update from client. Cancel is admin-only.
- **Firestore rules**: Not audited in this codebase (often in firestore.rules). Assume backend runs with admin SDK; API routes are the gate. Ensure Firestore rules do not allow client write to `bookings`, `holds`, or `waiverRequests` if client SDK is used elsewhere.
- **Sensitive data**: Card stored as display-only (brand, last4, exp). No raw card. Stripe IDs stored. Customer name/email/phone stored for operational need. **Recommendation:** Ensure PII handling complies with policy (retention, access).

---

# 13. ERROR HANDLING AUDIT

- **Webhook**: Try/catch at top; on failure writes error to `stripeEvents` doc so event is not left "processing". Returns 200 to avoid Stripe retries looping on 5xx. Good.
- **create-hold**: Errors (e.g. "Slot no longer available") return 409; others 400/404/500. Transaction throws on conflict; caught and mapped. No silent swallow of critical failures.
- **convertHoldToBooking**: Throws on hold not found, slot not held, etc. Caller (webhook, complete-after-payment) catches and logs; webhook writes outcome to stripeEvents. Email/waiver failures are caught and logged; booking still created. **Partial write risk:** If slot update succeeds but booking write fails inside same transaction, transaction aborts (no partial commit). If booking write succeeds and email fails, booking exists but customer might not get email — acceptable with logging.
- **Slots API**: 500 caught and returns generic message + optional hint; 503 when Firebase missing. Malformed slot docs skipped (toDateSafe). Prevents one bad doc from breaking response.
- **Waiver createWaiverForBooking**: Errors logged; returns null. Caller does not fail booking creation. So booking can exist without waiver link. Documented behavior.

---

# 14. CRITICAL FAILURE POINTS SUMMARY

## HIGH RISK

1. **Admin calendar-events filters by experienceId only (doc id)**  
   - **Impact:** Bookings stored with `experienceId: "pontoon"` or `"lake-austin-pontoon"` do not appear in admin calendar when filtering by experience Firestore id.  
   - **Likelihood:** High if any flow (e.g. direct checkout or legacy) writes slug.  
   - **Mitigation:** Query bookings by same slug variants as in slots API (e.g. for pontoon, also `experienceId in ["pontoon", "lake-austin-pontoon"]` or equivalent).

2. **Waiver pointer not updated for group signers**  
   - **Impact:** Booking shows waiver "pending" even after multiple party members sign; only primary link updates booking.waiver.status.  
   - **Likelihood:** Certain for any group booking where party members use group link.  
   - **Mitigation:** On any waiver request for that bookingId marked signed, update booking.waiver (e.g. status "signed" or signedCount); or show “signed N of M” from waiverRequests by bookingId.

3. **Firebase not configured in production**  
   - **Impact:** Slots, waiver-requests, bookings list, and calendar can return 503 or 500; booking creation can fail after payment.  
   - **Likelihood:** Environment-dependent.  
   - **Mitigation:** Ensure FIREBASE_* (or service account path) set in production; health check or startup validation.

## MEDIUM RISK

4. **Date iteration in getSlotGrid uses server local**  
   - **Impact:** If server is not in Central, day boundaries could theoretically shift for “today” or range.  
   - **Likelihood:** Low if deployment is fixed (e.g. UTC) and slot logic is date-string + Central hours.  
   - **Mitigation:** Iterate by date string in America/Chicago (e.g. getDateStrInSlotTimezone) for grid generation.

5. **Pricing recompute in webhook when hold.pricing missing**  
   - **Impact:** Slight drift if rate/date logic differs at webhook time.  
   - **Likelihood:** Low; hold usually has pricing.  
   - **Mitigation:** Always persist and use hold.pricing in webhook; fail or log if missing.

6. **No updatedAt on booking**  
   - **Impact:** Harder to audit when booking was last changed (e.g. cancel).  
   - **Likelihood:** N/A.  
   - **Mitigation:** Add `updatedAt` on any booking update (cancel, status change, etc.).

## LOW RISK

7. **Double-click on direct checkout**  
   - Can create two holds for same slot before first payment completes.  
   - Mitigation: Disable button after click or use idempotency key.

8. **Orphan waiver request if setBookingWaiverPointer fails**  
   - Rare; single failure between createRequest and setBookingWaiverPointer.  
   - Mitigation: Transaction or retry; or background job to fix missing pointers.

---

# 15. REQUIRED FIXES

## CRITICAL (must fix before production)

1. **Admin calendar-events:** Include bookings that have `experienceId` equal to the experience’s slug (e.g. pontoon / lake-austin-pontoon) when loading events for that experience, so admin calendar shows all relevant bookings regardless of whether doc id or slug was stored.
2. **Production env:** Ensure Firebase (and Stripe webhook URL + secret, Brevo) are correctly set in production and that slots/waiver-requests and booking creation are tested in that environment.

## IMPORTANT

3. **Waiver status for group signers:** When any waiver request for a booking is marked signed, update `booking.waiver.status` (or equivalent) so admin and any customer-facing view reflect “signed” or signed count.
4. **Slot grid date iteration:** Use America/Chicago for date iteration in getSlotGrid (or equivalent) to avoid any server-timezone dependency for day boundaries.
5. **Booking updatedAt:** Set `updatedAt` on every booking update (e.g. cancel, status change).

## OPTIONAL IMPROVEMENTS

6. **Direct checkout idempotency:** Prevent double hold creation (e.g. disable submit or idempotency key by slot + session).
7. **Waiver create + pointer:** Run in transaction or with retry so waiver request and booking pointer stay in sync.
8. **State machine:** Document and optionally enforce allowed booking status transitions in cancel and any future status APIs.
9. **Health/readiness:** Endpoint or startup check that verifies Firebase, Stripe config, and optionally Brevo so deployment issues are visible early.

---

# REMEDIATION APPLIED (POST-AUDIT)

The following fixes were implemented for production readiness:

- **CRITICAL – Admin calendar-events:** Bookings are now queried by experience doc id plus slug variants (same logic as slots API). `app/api/admin/calendar-events/route.ts`: loads experience doc, builds `experienceIdsToQuery` (id + slug; pontoon/lake-austin-pontoon both added when applicable), uses Firestore `in` query.
- **IMPORTANT – Waiver group signers:** When any waiver request for a booking is marked signed (including group signers), `booking.waiver.status` is set to `"signed"`. `lib/waiver/firestore.ts`: added `getBookingWaiverPointer` and `BookingWaiverPointer` type; `setBookingWaiverPointer` now sets `updatedAt`. `app/api/waiver/signing/submit/route.ts`: after `updateRequestSigned`, always updates booking waiver pointer to status `"signed"` (preserving primary requestId/template when present).
- **IMPORTANT – Slot grid date iteration:** `lib/booking/experience-slots.ts`: `getSlotGrid` now iterates by date string in America/Chicago via `getDateStrInSlotTimezone` and `nextDateStr` (calendar-day iteration, DST-safe).
- **IMPORTANT – Booking updatedAt:** `app/api/admin/bookings/[id]/cancel/route.ts`: all cancel paths set `updatedAt: FieldValue.serverTimestamp()`. `app/api/stripe/webhook/route.ts`: final_paid and payment_failed booking updates set `updatedAt`. `lib/waiver/firestore.ts`: `setBookingWaiverPointer` sets `updatedAt` on the booking.
- **OPTIONAL – Direct checkout double-submit:** `components/experience/ExperienceCalendarSectionView.tsx`: direct-checkout button is disabled whenever any slot is loading (`!!directCheckoutLoading`), and click handler returns early if already loading.
- **OPTIONAL – Health endpoint:** `app/api/health/route.ts`: GET returns 200 with `{ status: "ok", firebase, stripe }` when Firebase is reachable and Stripe config is present; 503 with `status: "degraded"` otherwise. No secrets exposed.

*Production env (FIREBASE_*, STRIPE_*, BREVO_*) and testing in target environment remain operator responsibilities (audit item #2).*
