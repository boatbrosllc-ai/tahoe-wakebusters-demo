# Booking availability & double-booking prevention

This doc describes how we keep a single source of truth for what’s booked, when, and which boat, and how we prevent double bookings across all calendars and booking flows.

**Book Now calendar:** Availability is **backend-only**. The calendar never hardcodes availability; it calls the slots API, which uses only real data: the **bookings** collection for "booked," the **holds** collection for active holds, and per-boat slot docs for "blocked" (e.g. maintenance). No other source can mark a slot unavailable.

## Single source of truth

- **Bookings** (`bookings` collection) are the **only** source of truth for whether a slot is **booked**.  
  Any booking with status in `paid`, `deposit_paid`, `final_due`, `final_paid`, or `final_processing` occupies that boat+slot.  
  The slots API **always** derives "booked" from the bookings collection and **never** trusts `status: "booked"` on slot docs (those can be stale after cancel or missed updates).  
  A booking is applied **only to the specific boat** in `booking.boatId`; we never mark all boats as booked for one booking (e.g. when boatId is missing).

- **Per-boat slots**: `boats/{boatId}/slots/{slotId}`  
  Each document has `startAt`, `endAt`, `status` (`open` | `held` | `booked` | `blocked`), and when applicable `holdId` or `bookingId`.  
  These are updated on hold/create, convert-to-booking, cancel, and cleanup-holds. For **display**, the slots API uses them for:
  - **held** / **blocked** / **open** (and for grid/times); **booked** on a slot doc is ignored and treated as **open** unless a matching booking exists.
  So calendars and boats reflect true availability: only slots with an actual (non-canceled) booking show as booked.

- **Slot id format**: `YYYY-MM-DD-startHour-durationHours` (e.g. `2026-02-27-11-6` = Feb 27, 11:00, 6h).

## Where availability is used

- **Slots API** (`/api/booking/slots`): Used by the site calendar, booking modal (step 2 date/time, step 3 boat list), and any embed. Returns per-slot status and `boatId` for experiences with boats.
- **Admin calendars**: Should use the same slots API (or same Firestore reads) so they see the same state.
- **Create-hold**: Before placing a hold, we check the slot (and overlaps) so we never double-book.
- **Convert-hold-to-booking**: Updates the slot to `booked` and writes the booking doc in one transaction.
- **Admin cancel**: Sets booking to `canceled` and sets the **correct** slot back to `open` (boat slot when `booking.boatId` is set, else experience slot).

## Double-booking prevention

1. **Slots API**
   - **Bookings first**: Queries `bookings` where `status` is in `paid`, `deposit_paid`, `final_due`, `final_paid`, `final_processing` and merges them into the slot map as `booked` (by experience + boat or boat only in legacy path). This is the only source of "booked".
   - **Slot docs**: Loads boat slot docs in the date range. Does **not** overwrite keys already set by bookings. For any slot doc with `status: "booked"`, the API treats it as `open` (stale slot doc) unless that slot was already set from a booking.
   - Builds a grid of possible slots; for each boat, `takenRanges` = all non-open slots (held, booked, blocked). Any grid slot that **overlaps** a taken range is returned as `blocked`, not `open`.
   - So the API never returns `open` for a time that overlaps an existing hold or booking, and never shows "booked" without a real booking.

2. **Create-hold** (and **create-checkout-session-direct** for direct calendar checkout)
   - **Experience with listing boats**: `boatId` is required; we use `boats/{boatId}/slots`. If omitted, we return 400.
   - **Existing slot doc**: In a transaction we read the slot. If it’s not `open` (and not the same extendable hold), we throw and return 409. Before taking an open slot we also query **bookings with status in BOOKING_STATUSES_SLOT_TAKEN** (paid, deposit_paid, final_due, final_paid, final_processing) for that boat/experience and reject if any overlap (defense in depth).
   - **New slot doc** (slot doesn’t exist yet): Before creating it we run an **overlap check** inside the same transaction:
     - **Listing-boat**: Query `boats/{boatId}/slots` for the same day; if any doc is not `open` and its [start, end] overlaps the requested [start, end], we throw. We also query **bookings with status in BOOKING_STATUSES_SLOT_TAKEN** for that experience+boat and reject if any overlap.
     - **Experience-only**: Same idea for `experiences/{experienceId}/slots` and bookings (status in BOOKING_STATUSES_SLOT_TAKEN) for that experience.
   - So we never create or claim a slot that overlaps an existing hold, booking, or blocked slot.

3. **Convert-hold-to-booking**
   - In a transaction we verify the slot is still held by this hold, then set the slot to `booked` and write the booking. Only one conversion wins per hold.

4. **Admin cancel**
   - We set the booking to `canceled` and release the slot to `open` in one transaction. For listing-boat bookings we use `boats/{boatId}/slots/{slotId}`; for experience-only we use `experiences/{experienceId}/slots/{slotId}`.

5. **Release-hold / cleanup-holds**
   - Release-hold (and cleanup of expired holds) sets the slot back to `open` and clears `holdId`, so the slot can be chosen again.

6. **Slots API: held slots**
   - Any slot with `status: "held"` is returned as `open` if the hold document is **missing**, **inactive** (e.g. `status !== "active"`), or **expired**. So after you delete holds (or bookings) in Firestore, calendars show full availability without needing to delete or edit slot docs.

## Why do I only see 2 times (or a few) on a date?

The Book Now calendar shows only slots the API returns as **open**. If you click a date (e.g. Feb 27) and see only two times, it means the rest of that day is marked **held** or **blocked** in the backend.

- **Held** – Slot docs under `boats/{boatId}/slots` with `status: "held"` and a **hold** in the `holds` collection that is still `status: "active"` and not expired. Deleting bookings does **not** remove holds; you must delete or expire documents in **`holds`** (or set `status` to something other than `"active"`) so those slots become open.
- **Blocked** – Slot docs with `status: "blocked"` (e.g. maintenance). Remove or update those slot docs if you want those times available.

**To see exactly why a date has few open slots:** call the slots API with `debug=1` or `byDate=1`:

`/api/booking/slots?experienceId=...&startDate=2026-02-01&endDate=2026-02-28&debug=1`

The response includes `byDate`, e.g. `"2026-02-27": { "open": 2, "held": 14, "booked": 0, "blocked": 0 }`. High `held` → clear the `holds` collection (or expire those holds). High `blocked` → fix or remove `blocked` slot docs under `boats/{boatId}/slots`.

## Clean slate for testing

**If you deleted all bookings and expect all times to be available:** the Book Now calendar uses only backend data. So:

1. **Delete (or expire) holds** in Firestore: `holds` collection. The slots API treats "held" as open when the hold doc is missing, not active, or expired. If you only deleted bookings, **holds can still be there** and will keep those slots from showing as available until you delete or expire them.
2. **Optional:** In `boats/{boatId}/slots`, delete slot docs or set `status: "open"` and clear `holdId` / `bookingId`. The API already ignores stale "booked" on slot docs and treats missing/inactive holds as open. Any slot doc with `status: "blocked"` will still block that time (use this for maintenance, etc.).

No need to touch the slots API or run a script; clear `bookings` and `holds` (and optionally reset slot docs), then refresh the calendar.

## What you can rely on

- **Calendars and booking UI** always call the slots API (or equivalent) and never show a slot as available if it’s held, booked, or blocked.
- **Create-hold** never allows a hold that overlaps an existing non-open slot (same boat or same experience).
- **Paid bookings** are always reflected in availability (via merge in slots API and via slot doc update on payment).
- **Cancel** always frees the correct slot (boat or experience) so that time can be rebooked.

This gives a single, consistent view of “what’s booked, when, what boat” and prevents double bookings across all flows.

## Slots API: experience id vs slug

- The admin calendar (and site) call the slots API with the experience **Firestore document id**. Some data may be stored by **slug** (e.g. boats linked with `experienceIds: ["lake-austin-pontoon-charter"]`, or bookings with `experienceId: "lake-austin-pontoon-charter"`).
- The slots API handles both: it looks up boats by `experienceIds array-contains experienceId` first; if **no boats** are found, it tries `experienceIds array-contains experienceSlug` (from the experience doc). For **bookings**, it queries by experience id and also by experience slug and merges results. So the admin calendar shows slots and booked times even when boats or bookings use the slug.

## Checkout consistency (site + mobile)

- **Experience ID required**: BookingModal and CalendarModal **never** call the slots, boats, rates, addons, or date-prices APIs with an undefined experience id. All effects that use `experienceId` are guarded on `selectedExperience?.id`. If the experience is resolved by slug only (e.g. FALLBACK_EXPERIENCES in CalendarModal), we fetch `/api/experiences/{slug}` first to get the doc and set `id`, then fetch slots. This avoids `experienceId=undefined` requests that would return wrong or empty data and cause boats to appear greyed out when they are available.

- **Timezone**: The slots API builds the grid using the server's "today" and skips past slots only for that day. Slot `startAt` is sent as ISO; the client compares by the same ISO for boat availability (same slot, same ms). If "today" or "past" seem wrong (e.g. late-night or cross-timezone), consider normalizing slot date/time to a single timezone (e.g. experience TZ or America/Chicago) in both `getSlotGrid` and the client.
