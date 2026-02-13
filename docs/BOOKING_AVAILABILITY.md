# Booking availability & double-booking prevention

This doc describes how we keep a single source of truth for what’s booked, when, and which boat, and how we prevent double bookings across all calendars and booking flows.

## Single source of truth

- **Per-boat slots**: `boats/{boatId}/slots/{slotId}`  
  Each document has `startAt`, `endAt`, `status` (`open` | `held` | `booked` | `blocked`), and when applicable `holdId` or `bookingId`.  
  This is the **write** source of truth: holds and paid bookings update these docs.

- **Bookings**: `bookings` collection  
  Paid bookings have `experienceId`, `boatId`, `slotId`, `status: "paid"`.  
  The **slots API** merges paid bookings into availability so that:
  - If a boat slot doc is missing (e.g. legacy data), the booking still blocks that boat/time.
  - All calendars and the booking modal read from one API that combines boat slots + paid bookings.

- **Slot id format**: `YYYY-MM-DD-startHour-durationHours` (e.g. `2026-02-27-11-6` = Feb 27, 11:00, 6h).

## Where availability is used

- **Slots API** (`/api/booking/slots`): Used by the site calendar, booking modal (step 2 date/time, step 3 boat list), and any embed. Returns per-slot status and `boatId` for experiences with boats.
- **Admin calendars**: Should use the same slots API (or same Firestore reads) so they see the same state.
- **Create-hold**: Before placing a hold, we check the slot (and overlaps) so we never double-book.
- **Convert-hold-to-booking**: Updates the slot to `booked` and writes the booking doc in one transaction.
- **Admin cancel**: Sets booking to `canceled` and sets the **correct** slot back to `open` (boat slot when `booking.boatId` is set, else experience slot).

## Double-booking prevention

1. **Slots API**
   - Loads all boat slot docs in the requested date range.
   - Merges in **paid** bookings for the experience (by `experienceId`); each booking marks that `boatId` + `slotId` as `booked`.
   - Builds a grid of possible slots; for each boat, `takenRanges` = all non-open slots (held, booked, blocked). Any grid slot that **overlaps** a taken range is returned as `blocked`, not `open`.
   - So the API never returns `open` for a time that overlaps an existing hold or booking.

2. **Create-hold** (and **create-checkout-session-direct** for direct calendar checkout)
   - **Experience with listing boats**: `boatId` is required; we use `boats/{boatId}/slots`. If omitted, we return 400.
   - **Existing slot doc**: In a transaction we read the slot. If it’s not `open` (and not the same extendable hold), we throw and return 409. Before taking an open slot we also query **paid bookings** for that boat/experience and reject if any overlap (defense in depth).
   - **New slot doc** (slot doesn’t exist yet): Before creating it we run an **overlap check** inside the same transaction:
     - **Listing-boat**: Query `boats/{boatId}/slots` for the same day; if any doc is not `open` and its [start, end] overlaps the requested [start, end], we throw. We also query **paid bookings** for that experience+boat and reject if any overlap.
     - **Experience-only**: Same idea for `experiences/{experienceId}/slots` and paid bookings for that experience.
   - So we never create or claim a slot that overlaps an existing hold, booking, or blocked slot.

3. **Convert-hold-to-booking**
   - In a transaction we verify the slot is still held by this hold, then set the slot to `booked` and write the booking. Only one conversion wins per hold.

4. **Admin cancel**
   - We set the booking to `canceled` and release the slot to `open` in one transaction. For listing-boat bookings we use `boats/{boatId}/slots/{slotId}`; for experience-only we use `experiences/{experienceId}/slots/{slotId}`.

5. **Release-hold / cleanup-holds**
   - Release-hold (and cleanup of expired holds) sets the slot back to `open` and clears `holdId`, so the slot can be chosen again.

## What you can rely on

- **Calendars and booking UI** always call the slots API (or equivalent) and never show a slot as available if it’s held, booked, or blocked.
- **Create-hold** never allows a hold that overlaps an existing non-open slot (same boat or same experience).
- **Paid bookings** are always reflected in availability (via merge in slots API and via slot doc update on payment).
- **Cancel** always frees the correct slot (boat or experience) so that time can be rebooked.

This gives a single, consistent view of “what’s booked, when, what boat” and prevents double bookings across all flows.
