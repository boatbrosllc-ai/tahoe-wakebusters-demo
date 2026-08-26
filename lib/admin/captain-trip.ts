import { toDateStr } from "@/lib/booking/booking-date-range";
import type { AssignedCaptainPublic } from "@/lib/admin/assigned-captain";
import { readOperatorNotesLog, type OperatorNoteEntry } from "@/lib/admin/operator-notes";

export type CaptainTrip = {
  id: string;
  type: "booking";
  bookingId?: string;
  startAt: string;
  endAt: string;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  boatName?: string | null;
  experienceName?: string;
  customer?: { name?: string; phone?: string; email?: string };
  partySize?: number | null;
  petsCount?: number | null;
  specialNotes?: string | null;
  guestComments?: string | null;
  operatorNotes?: string | null;
  operatorNotesBy?: string | null;
  operatorNotesLog?: OperatorNoteEntry[] | null;
  locationText?: string | null;
  durationHours?: number | null;
  addonsWithNames?: { addonId: string; name: string; qty: number }[];
  pickup?: {
    title?: string | null;
    address?: string | null;
    notes?: string | null;
    mapUrl?: string | null;
    arrivalInstructions?: string | null;
  } | null;
  waiver?: { status?: string } | null;
  marketplaceDetails?: Record<string, string> | null;
  source?: string | null;
  externalProvider?: string | null;
  externalBookingId?: string | null;
  assignedCaptain?: AssignedCaptainPublic | null;
  pricing?: { totalCents?: number } | null;
};

export function addCaptainTripDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

export function captainTripDate(ev: CaptainTrip): string {
  return ev.startDate || toDateStr(new Date(ev.startAt));
}

export function captainWeekdayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

export function captainMonthDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function captainTripLabel(ev: CaptainTrip): string {
  return ev.customer?.name?.trim() || ev.experienceName || "Charter";
}

export function captainHasOpsNotes(ev: CaptainTrip): boolean {
  return readOperatorNotesLog(ev).length > 0;
}

export function captainGuestNotes(ev: CaptainTrip): string | null {
  const parts = [ev.specialNotes?.trim(), ev.guestComments?.trim()].filter(Boolean);
  if (parts.length === 0) return null;
  const unique = Array.from(new Set(parts.map((p) => p!.toLowerCase())));
  if (unique.length === 1) return parts[0]!;
  return parts.join("\n\n");
}

export function captainPickupHasDetails(pickup: CaptainTrip["pickup"]): boolean {
  if (!pickup) return false;
  return Boolean(
    pickup.title?.trim() || pickup.address?.trim() || pickup.notes?.trim() || pickup.arrivalInstructions?.trim()
  );
}

export function captainWaiverLabel(status: string | undefined): string {
  if (status === "signed") return "Signed";
  if (status === "partial") return "Partial";
  if (status === "pending") return "Pending";
  return status?.trim() || "—";
}

export function captainWaiverNeedsAttention(status: string | undefined): boolean {
  return status === "pending" || status === "partial" || !status;
}

export function captainTripTimeRange(ev: CaptainTrip): string {
  if (!ev.startTime) return "Time TBD";
  return ev.endTime ? `${ev.startTime} – ${ev.endTime}` : ev.startTime;
}
