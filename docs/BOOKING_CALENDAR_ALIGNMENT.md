# Booking save and calendar alignment

## How we save bookings

Bookings are created in **convert-hold-to-booking** (used by the Stripe webhook and any complete-after-payment flow). The booking document is written to `bookings/{bookingId}` with:

| Field | Source | Purpose |
|-------|--------|---------|
| `experienceId` | hold | Which listing |
| `boatId` | hold | Which boat (if listing has boats) |
| `slotId` | hold | Slot id from client, e.g. `YYYY-MM-DD-HH-D` or `YYYY-M-D-H-D` |
| **`startDateStr`** | **parsed from `hold.slotId`** | **Trip date YYYY-MM-DD** — used for admin calendar trip-date queries |
| `rateId`, `addonSelections`, `partySize`, `petsCount`, `answers`, `customer`, `pricing`, `status: "paid"`, `stripe`, `createdAt` | hold / conversion | Rest of booking |

- **slotId** is stored as provided by the client (create-hold / checkout). It identifies the trip date, start hour, and duration (e.g. `2026-02-27-11-6` = Feb 27, 11:00, 6h).
- **startDateStr** is set from `parseSlotId(hold.slotId).dateStr` so it is always normalized `YYYY-MM-DD`. New bookings have this; legacy ones may not.

## How the calendar gets the correct date

- **Single source of truth for “trip date”:** the **slot id** (and its parsed `dateStr`). We never derive the calendar day from `startAt` (UTC) alone, so timezone does not shift the day.

1. **Slots API** (`/api/booking/slots`)
   - Loads paid bookings and merges them into slots. Each slot has **`dateStr`** set from the booking’s slotId (parsed, normalized).
   - Response includes **`dateStr`** on every slot (from slot id). Past booked/held slots in range are included so all bookings appear.

2. **Admin bookings API** (`/api/admin/bookings`)
   - Trip-date filter uses **`startDateStr`** when present, else **`parseSlotIdForDisplay(b.slotId).dateStr`** (handles `2026-2-27-11-6` etc.).
   - Response `startDate` / `startTime` / `endTime` come from the same parsing so list and dashboard calendar match.

3. **Calendar management page** (admin Calendars tab)
   - Groups slots by **`getSlotCalendarDate(slot)`**, which:
     - Prefers **`slot.dateStr`** if it’s a valid `YYYY-MM-DD`;
     - Else parses **`slot.id`** (slot id) to get the date;
     - Only falls back to `startAt.slice(0,10)` as a last resort.
   - So the calendar day is always the trip date from the slot id, not UTC.

## Summary

- **Booking save:** We persist **slotId** and **startDateStr** (from slotId). All other booking fields are stored as documented.
- **Calendar accuracy:** Slots API and admin API expose **dateStr** / **startDateStr** from the slot id. The admin calendar groups by **getSlotCalendarDate(slot)** so the displayed date matches the booking date regardless of server or client timezone.
