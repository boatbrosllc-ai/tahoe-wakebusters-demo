"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Clock, User, Ship, DollarSign, Lock, Unlock, Mail, ExternalLink, LayoutGrid, CalendarDays } from "lucide-react";
import { AdminCalendarWeekView } from "@/components/admin/AdminCalendarWeekView";

type SlotStatus = "open" | "held" | "booked" | "blocked";

interface BookingSummary {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  boatName: string | null;
  totalCents: number;
  status: string;
}

interface SlotDto {
  id: string;
  /** Calendar date YYYY-MM-DD from slot id — use for grouping so bookings show on the correct day. */
  dateStr?: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  holdId?: string | null;
  bookingId?: string | null;
  expiresAt?: string;
  bookingSummary?: BookingSummary | null;
  boatId?: string;
  /** Experience (listing) id — used for block actions and "listing" label in modal. */
  experienceId?: string;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getMonthRange(month: Date): { start: string; end: string } {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 2, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

/** Calendar date YYYY-MM-DD for a slot — always from slot id, never from startAt (UTC). */
function getSlotCalendarDate(slot: SlotDto): string {
  if (slot.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(slot.dateStr)) return slot.dateStr;
  const parsed = parseSlotId(slot.id);
  if (parsed) return parsed.dateStr;
  const parts = slot.id.trim().split("-");
  if (parts.length >= 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    const s = `${y}-${m}-${d}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  return slot.startAt.slice(0, 10);
}

const SLOT_STATUS_CLASS: Record<SlotStatus, string> = {
  open: "bg-emerald-100 text-emerald-800 border-emerald-200",
  held: "bg-amber-100 text-amber-800 border-amber-200",
  booked: "bg-blue-100 text-blue-800 border-blue-200",
  blocked: "bg-brand-dark/10 text-brand-muted border-brand-dark/20",
};

const SLOT_LABELS: Record<SlotStatus, string> = {
  open: "Available",
  held: "Held (checkout)",
  booked: "Booked",
  blocked: "Blocked",
};

/** Colors for boat chips and event bars (cycle by boat index). */
const BOAT_COLORS = [
  "rgb(59 130 246)",   // blue
  "rgb(16 185 129)",   // emerald
  "rgb(245 158 11)",   // amber
  "rgb(139 92 246)",   // violet
  "rgb(244 63 94)",   // rose
  "rgb(6 182 212)",    // cyan
];
function getBoatColor(boatIndex: number): string {
  return BOAT_COLORS[boatIndex % BOAT_COLORS.length] ?? BOAT_COLORS[0];
}

/** Boat with experienceIds for block-by-experience logic. */
interface BoatItem {
  id: string;
  name: string;
  experienceIds: string[];
}

export default function CalendarsPage() {
  /** Map from experience slug or doc id to Firestore document id (so we always call slots API with doc id). */
  const [experienceDocIdBySlugOrId, setExperienceDocIdBySlugOrId] = useState<Map<string, string>>(new Map());
  const [boatList, setBoatList] = useState<BoatItem[]>([]);
  const [experienceNames, setExperienceNames] = useState<Map<string, string>>(new Map());
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [bookingsBySlotId, setBookingsBySlotId] = useState<Map<string, BookingSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeSectionOpen, setRangeSectionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boatNames, setBoatNames] = useState<Map<string, string>>(new Map());
  const [blockDayBoatIds, setBlockDayBoatIds] = useState<Set<string>>(new Set());
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  /** When empty, show all boats; when non-empty, show only these boats. */
  const [selectedBoatIds, setSelectedBoatIds] = useState<Set<string>>(new Set());
  const [bookingDetailId, setBookingDetailId] = useState<string | null>(null);
  const [bookingDetailOpen, setBookingDetailOpen] = useState(false);
  const [bookingDetail, setBookingDetail] = useState<{
    id: string;
    experienceName: string;
    boatName: string | null;
    customer: { name?: string; email?: string; phone?: string };
    partySize: number | null;
    petsCount: number;
    specialNotes: string | null;
    addonsWithNames: { addonId: string; name: string; qty: number }[];
    pricing?: { totalCents?: number; currency?: string };
    status: string;
    startDate: string | null;
    startTime: string | null;
    endTime: string | null;
    durationHours: number | null;
    stripe?: { paymentIntentId?: string };
  } | null>(null);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);

  /** Unique experience Firestore document ids — resolve slug to id so slots API finds the experience. */
  const uniqueExperienceIds = useMemo(() => {
    const docIds = new Set<string>();
    boatList.forEach((b) => {
      (b.experienceIds ?? []).forEach((slugOrId) => {
        const docId = experienceDocIdBySlugOrId.get(slugOrId) ?? slugOrId;
        docIds.add(docId);
      });
    });
    return Array.from(docIds);
  }, [boatList, experienceDocIdBySlugOrId]);

  const dateRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);

  const fetchBoatsAndExperiences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [boatsRes, experiencesRes] = await Promise.all([
        fetch("/api/admin/boats", { credentials: "include" }),
        fetch("/api/admin/experiences", { credentials: "include" }),
      ]);
      if (!boatsRes.ok) {
        const data = await boatsRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load boats");
      }
      const boatsData = await boatsRes.json();
      const boats = Array.isArray(boatsData.boats) ? boatsData.boats : [];
      const boatItems: BoatItem[] = boats.map((b: { id: string; name?: string; experienceIds?: string[] }) => ({
        id: b.id,
        name: b.name ?? b.id,
        experienceIds: Array.isArray(b.experienceIds) ? b.experienceIds : [],
      }));
      setBoatList(boatItems);
      const boatNameMap = new Map<string, string>();
      boatItems.forEach((b) => boatNameMap.set(b.id, b.name));
      setBoatNames(boatNameMap);

      if (experiencesRes.ok) {
        const expList = await experiencesRes.json();
        const expNameMap = new Map<string, string>();
        const slugOrIdToDocId = new Map<string, string>();
        (Array.isArray(expList) ? expList : []).forEach((e: { id: string; title?: string; slug?: string }) => {
          expNameMap.set(e.id, e.title ?? e.slug ?? e.id);
          slugOrIdToDocId.set(e.id, e.id);
          if (e.slug && e.slug.trim()) slugOrIdToDocId.set(e.slug.trim(), e.id);
        });
        setExperienceNames(expNameMap);
        setExperienceDocIdBySlugOrId(slugOrIdToDocId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load boats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoatsAndExperiences();
  }, [fetchBoatsAndExperiences]);

  const fetchSlots = useCallback(async () => {
    if (uniqueExperienceIds.length === 0) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const all = await Promise.all(
        uniqueExperienceIds.map((experienceId) =>
          fetch(
            `/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${dateRange.start}&endDate=${dateRange.end}`,
            { credentials: "include" }
          ).then((res) => (res.ok ? res.json() : { slots: [] }))
        )
      );
      const merged = all.flatMap((data) => (Array.isArray(data.slots) ? data.slots : []));
      setSlots(merged);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [uniqueExperienceIds, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/bookings?fromTripDate=${dateRange.start}&toTripDate=${dateRange.end}&limit=500`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load bookings");
      const list = await res.json();
      const map = new Map<string, BookingSummary>();
      const statuses = [...BOOKING_STATUSES_SLOT_TAKEN];
      (Array.isArray(list) ? list : [])
        .filter((b: { status?: string }) => typeof b.status === "string" && (statuses as readonly string[]).includes(b.status))
        .forEach((b: { id: string; customer?: { name?: string; email?: string }; boatName?: string | null; pricing?: { totalCents?: number }; status?: string }) => {
          map.set(b.id, {
            bookingId: b.id,
            customerName: b.customer?.name ?? "",
            customerEmail: b.customer?.email ?? "",
            boatName: b.boatName ?? null,
            totalCents: b.pricing?.totalCents ?? 0,
            status: b.status ?? "",
          });
        });
      setBookingsBySlotId(map);
    } catch {
      setBookingsBySlotId(new Map());
    } finally {
      setBookingsLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (!bookingDetailOpen || !bookingDetailId) {
      setBookingDetail(null);
      return;
    }
    setBookingDetailLoading(true);
    setBookingDetail(null);
    fetch(`/api/admin/bookings/${encodeURIComponent(bookingDetailId)}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load booking");
        return res.json();
      })
      .then(setBookingDetail)
      .catch(() => setBookingDetail(null))
      .finally(() => setBookingDetailLoading(false));
  }, [bookingDetailOpen, bookingDetailId]);

  const enrichedSlots = useMemo(() => {
    return slots.map((s) => ({
      ...s,
      bookingSummary: s.bookingId ? bookingsBySlotId.get(s.bookingId) ?? null : null,
    }));
  }, [slots, bookingsBySlotId]);

  const filteredSlots = useMemo(() => {
    if (selectedBoatIds.size === 0) return enrichedSlots;
    return enrichedSlots.filter((s) => s.boatId && selectedBoatIds.has(s.boatId));
  }, [enrichedSlots, selectedBoatIds]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, { open: number; held: number; booked: number; blocked: number; slots: SlotDto[] }>();
    for (const s of filteredSlots) {
      const day = getSlotCalendarDate(s);
      if (!map.has(day)) map.set(day, { open: 0, held: 0, booked: 0, blocked: 0, slots: [] });
      const entry = map.get(day)!;
      entry.slots.push(s);
      if (s.status === "open") entry.open++;
      else if (s.status === "held") entry.held++;
      else if (s.status === "booked") entry.booked++;
      else entry.blocked++;
    }
    map.forEach((entry) => entry.slots.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [filteredSlots]);

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: {
      dateStr: string;
      day: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      openCount: number;
      bookedCount: number;
      heldCount: number;
      blockedCount: number;
    }[] = [];
    const pushCell = (dateStr: string, day: number, isCurrentMonth: boolean, isPast: boolean) => {
      const entry = slotsByDate.get(dateStr);
      cells.push({
        dateStr,
        day,
        isCurrentMonth,
        isPast,
        openCount: entry?.open ?? 0,
        bookedCount: entry?.booked ?? 0,
        heldCount: entry?.held ?? 0,
        blockedCount: entry?.blocked ?? 0,
      });
    };
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      pushCell(toDateStr(d), d.getDate(), false, toDateStr(d) < todayStr);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      pushCell(dateStr, day, true, dateStr < todayStr);
    }
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      pushCell(toDateStr(d), d.getDate(), false, true);
    }
    return cells;
  }, [calendarMonth, slotsByDate, todayStr]);

  const bookedSlotsByDay = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of filteredSlots) {
      if (s.status !== "booked") continue;
      const day = getSlotCalendarDate(s);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    map.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [filteredSlots]);

  const selectedDateSlots = selectedDate ? slotsByDate.get(selectedDate)?.slots ?? [] : [];

  const blockDate = async (dateStr: string) => {
    if (uniqueExperienceIds.length === 0) return;
    const key = `date-${dateStr}`;
    setBlocking(key);
    setError(null);
    const boatIdsPayload = blockDayBoatIds.size > 0 ? Array.from(blockDayBoatIds) : undefined;
    try {
      for (const experienceId of uniqueExperienceIds) {
        const boatIds = boatIdsPayload != null
          ? boatList.filter((b) => b.experienceIds?.includes(experienceId) && blockDayBoatIds.has(b.id)).map((b) => b.id)
          : undefined;
        if (boatIdsPayload != null && boatIds?.length === 0) continue;
        const res = await fetch("/api/booking/block-date", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experienceId, date: dateStr, action: "block", boatIds: boatIds ?? undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to block date");
      }
      await fetchSlots();
      setDayDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block date");
    } finally {
      setBlocking(null);
    }
  };

  const unblockDate = async (dateStr: string) => {
    if (uniqueExperienceIds.length === 0) return;
    const key = `date-${dateStr}`;
    setBlocking(key);
    setError(null);
    try {
      for (const experienceId of uniqueExperienceIds) {
        const res = await fetch("/api/booking/block-date", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experienceId, date: dateStr, action: "unblock" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to unblock date");
      }
      await fetchSlots();
      setDayDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unblock date");
    } finally {
      setBlocking(null);
    }
  };

  const blockSlot = async (slot: SlotDto) => {
    const experienceId = slot.experienceId ?? uniqueExperienceIds[0];
    if (!experienceId) return;
    setBlocking(slot.id);
    setError(null);
    try {
      const res = await fetch("/api/booking/block-slot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId, slotId: slot.id, boatId: slot.boatId ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to block slot");
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block slot");
    } finally {
      setBlocking(null);
    }
  };

  const unblockSlot = async (slot: SlotDto) => {
    const experienceId = slot.experienceId ?? uniqueExperienceIds[0];
    if (!experienceId) return;
    setActionLoading(slot.id);
    setError(null);
    try {
      const res = await fetch("/api/booking/unblock-slot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId, slotId: slot.id, boatId: slot.boatId ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to unblock slot");
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unblock slot");
    } finally {
      setActionLoading(null);
    }
  };

  /** Group slots for selected day by time range (start–end + duration) so we show each window once with boats underneath. */
  const selectedDateTimeGroups = useMemo(() => {
    if (!selectedDate || selectedDateSlots.length === 0) return [];
    const byKey = new Map<string, SlotDto[]>();
    for (const s of selectedDateSlots) {
      const key = `${s.startAt}-${s.endAt}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(s);
    }
    return Array.from(byKey.entries())
      .map(([key, slots]) => ({ key, slots, startAt: slots[0].startAt }))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [selectedDate, selectedDateSlots]);

  const releaseHold = async (holdId: string) => {
    setActionLoading(holdId);
    setError(null);
    try {
      const res = await fetch("/api/booking/release-hold", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.released) throw new Error(data.message ?? "Failed to release hold");
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to release hold");
    } finally {
      setActionLoading(null);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    if (!confirm("Cancel this booking? The slot will become available again. This cannot be undone.")) return;
    setActionLoading(bookingId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel booking");
      await fetchSlots();
      await fetchBookings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel booking");
    } finally {
      setActionLoading(null);
    }
  };

  const openDayDetail = (dateStr: string) => {
    setSelectedDate(dateStr);
    setBlockDayBoatIds(new Set());
    setDayDetailOpen(true);
  };

  /** Click a day: always open the day-detail modal (no one-click block from cell to avoid reload/confusion). */
  const handleDateCellClick = (cell: (typeof calendarDays)[0], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cell.isPast) return;
    openDayDetail(cell.dateStr);
  };

  const blockRange = async () => {
    if (uniqueExperienceIds.length === 0 || !rangeStart || !rangeEnd) return;
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (start > end) {
      setError("Start date must be before end date.");
      return;
    }
    setRangeLoading(true);
    setError(null);
    try {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toDateStr(d);
        if (dateStr < todayStr) continue;
        for (const experienceId of uniqueExperienceIds) {
          await fetch("/api/booking/block-date", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ experienceId, date: dateStr, action: "block" }),
          });
        }
      }
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block range");
    } finally {
      setRangeLoading(false);
    }
  };

  const unblockRange = async () => {
    if (uniqueExperienceIds.length === 0 || !rangeStart || !rangeEnd) return;
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (start > end) {
      setError("Start date must be before end date.");
      return;
    }
    setRangeLoading(true);
    setError(null);
    try {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toDateStr(d);
        for (const experienceId of uniqueExperienceIds) {
          await fetch("/api/booking/block-date", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ experienceId, date: dateStr, action: "unblock" }),
          });
        }
      }
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unblock range");
    } finally {
      setRangeLoading(false);
    }
  };

  const formatCents = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);

  return (
    <div className="space-y-6">
      {/* Header: title + sync message */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Calendar</h1>
          <p className="text-sm text-brand-muted mt-0.5">
            Bookings from your site appear here. Click a date to manage slots, block days, or open booking details.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("/admin/bookings", "_blank")}
          className="shrink-0 gap-1.5"
        >
          <CalendarIcon className="h-4 w-4" />
          Add booking (via Bookings)
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-brand-dark/10 bg-white p-8 text-center text-brand-muted">
          Loading…
        </div>
      )}
      {!loading && boatList.length === 0 && (
        <div className="rounded-xl border border-brand-dark/10 bg-white p-8 text-center text-brand-muted">
          <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-brand-muted/50" />
          <p className="font-medium text-brand-dark">Add boats to see the calendar</p>
          <p className="text-sm text-brand-muted mt-1 max-w-sm mx-auto">
            Create and assign boats in <strong>Boats</strong>. Bookings from your site will appear here by boat, date, and time.
          </p>
        </div>
      )}
      {!loading && boatList.length > 0 && (
        <>
          {/* View toggle: Month | Week (Google Calendar–style) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-brand-muted">View</span>
            <div className="flex rounded-lg p-0.5 bg-brand-bg/50 border border-brand-dark/15">
              <button
                type="button"
                onClick={() => setCalendarView("month")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                  calendarView === "month" ? "bg-white text-brand-dark shadow-sm border border-brand-dark/10" : "text-brand-muted hover:text-brand-dark"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarView("week");
                  const d = new Date(calendarMonth);
                  d.setDate(d.getDate() - d.getDay());
                  d.setHours(0, 0, 0, 0);
                  setWeekStart(d);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                  calendarView === "week" ? "bg-white text-brand-dark shadow-sm border border-brand-dark/10" : "text-brand-muted hover:text-brand-dark"
                )}
              >
                <CalendarDays className="h-4 w-4" />
                Week
              </button>
            </div>
          </div>

          {/* Boat filter: multi-select with color coding */}
          {boatList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-brand-muted">Boats:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedBoatIds(new Set())}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
                    selectedBoatIds.size === 0
                      ? "bg-brand-primary/15 text-brand-primary border-brand-primary/40"
                      : "bg-white border-brand-dark/15 text-brand-dark hover:border-brand-dark/30"
                  )}
                >
                  All
                </button>
                {boatList.map((boat, idx) => {
                  const color = getBoatColor(idx);
                  const isSelected = selectedBoatIds.size === 0 || selectedBoatIds.has(boat.id);
                  return (
                    <button
                      key={boat.id}
                      type="button"
                      onClick={() => {
                        if (selectedBoatIds.size === 0) {
                          setSelectedBoatIds(new Set([boat.id]));
                        } else {
                          setSelectedBoatIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(boat.id)) {
                              next.delete(boat.id);
                              return next.size === 0 ? new Set() : next;
                            }
                            next.add(boat.id);
                            return next;
                          });
                        }
                      }}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium border transition-all flex items-center gap-1.5",
                        isSelected ? "border-current" : "bg-white border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                      )}
                      style={isSelected ? { borderColor: color, color, backgroundColor: `${color}12` } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
                      {boat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {calendarView === "week" ? (
            <AdminCalendarWeekView
              experienceId={uniqueExperienceIds[0] ?? ""}
              boatList={boatList.map((b) => ({ id: b.id, name: b.name }))}
              weekStart={weekStart}
              selectedBoatIds={selectedBoatIds.size === 0 ? undefined : Array.from(selectedBoatIds)}
              boatColorByIndex={boatList.reduce<Record<number, string>>((acc, _, i) => ({ ...acc, [i]: getBoatColor(i) }), {})}
              onPrevWeek={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })}
              onNextWeek={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })}
              onBookingClick={(bookingId) => { setBookingDetailId(bookingId); setBookingDetailOpen(true); }}
              onRefresh={() => { fetchSlots(); fetchBookings(); }}
            />
          ) : (
          <>
          {/* Quick actions: block range (collapsible) */}
          <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
            <button
              type="button"
              onClick={() => setRangeSectionOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 sm:px-6 text-left text-sm font-medium text-brand-dark hover:bg-brand-bg/30 transition-colors"
            >
              <span>Block or unblock a date range</span>
              {rangeSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {rangeSectionOpen && (
              <div className="border-t border-brand-dark/10 px-4 py-4 sm:px-6 sm:py-4 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-brand-muted">From</span>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-brand-muted">To</span>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                  />
                </label>
                <Button variant="outline" size="sm" onClick={blockRange} disabled={rangeLoading || !rangeStart || !rangeEnd}>
                  {rangeLoading ? "Saving…" : "Block range"}
                </Button>
                <Button variant="outline" size="sm" onClick={unblockRange} disabled={rangeLoading || !rangeStart || !rangeEnd}>
                  {rangeLoading ? "Saving…" : "Unblock range"}
                </Button>
              </div>
            )}
          </div>

          {/* Calendar card */}
          <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
            <div className="sticky top-0 z-10 px-4 py-4 sm:px-6 sm:py-4 border-b border-brand-dark/10 bg-white/95 backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-brand-dark">
                Calendar
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 transition-colors"
                  aria-label="Previous month"
                >
                  ←
                </button>
                <span className="min-w-[140px] text-center text-base font-medium text-brand-dark">{monthLabel}</span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 transition-colors"
                  aria-label="Next month"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/20"
                >
                  Today
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Booked
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Held
                </span>
                <span className="inline-flex items-center gap-1.5 text-brand-muted font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-muted" /> Blocked
                </span>
                {boatList.length > 1 && (
                  <>
                    <span className="w-px h-4 bg-brand-dark/15" aria-hidden />
                    {boatList.map((boat, idx) => (
                      <span key={boat.id} className="inline-flex items-center gap-1.5 font-medium" style={{ color: getBoatColor(idx) }}>
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getBoatColor(idx) }} /> {boat.name}
                      </span>
                    ))}
                  </>
                )}
              </div>

              {slotsLoading ? (
                <div className="grid min-h-[380px] place-items-center text-brand-muted text-sm">Loading calendar…</div>
              ) : (
                <>
                  {slots.length === 0 && (
                    <p className="text-xs text-brand-muted mb-3 text-center">
                      No time slots in this date range. Assign boats to listings and add rates to see availability, or pick another month.
                    </p>
                  )}
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="py-2 text-center text-xs font-semibold text-brand-muted uppercase tracking-wide">
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((cell) => {
                    const daySlots = slotsByDate.get(cell.dateStr)?.slots ?? [];
                    const bookedForDay = bookedSlotsByDay.get(cell.dateStr) ?? [];
                    const isPast = cell.isPast;
                    const isToday = cell.isCurrentMonth && cell.dateStr === todayStr;
                    const cellBusy = blocking === `date-${cell.dateStr}`;
                    const openCount = cell.openCount;
                    const bookedCount = cell.bookedCount;
                    const heldCount = cell.heldCount;
                    const blockedCount = cell.blockedCount;
                    return (
                      <button
                        key={cell.dateStr + cell.day}
                        type="button"
                        onClick={(e) => {
                          if (isPast || cellBusy) return;
                          handleDateCellClick(cell, e);
                        }}
                        disabled={isPast || cellBusy}
                        title={isPast ? "Past" : "View time slots"}
                        className={cn(
                          "min-h-[140px] sm:min-h-[160px] flex flex-col rounded-xl border p-2 text-left transition-all overflow-hidden",
                          "hover:shadow-md hover:ring-1 hover:ring-brand-primary/20",
                          cell.isCurrentMonth ? "text-brand-dark" : "text-brand-muted/70",
                          isPast && "cursor-not-allowed bg-brand-bg/40 opacity-80 border-brand-dark/5",
                          !isPast && "cursor-pointer bg-white border-brand-dark/10",
                          isToday && !isPast && "ring-2 ring-brand-primary/50 bg-brand-primary/5",
                          cellBusy && "opacity-70 pointer-events-none"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5 shrink-0">
                          <span className={cn("text-sm font-bold tabular-nums", isToday ? "text-brand-primary" : "text-brand-dark")}>
                            {cell.day}
                          </span>
                          {isToday && !isPast && <span className="text-[10px] font-medium text-brand-primary">Today</span>}
                        </div>
                        {/* Bookings first — what matters most */}
                        <div className="flex flex-col gap-1 flex-1 min-h-0">
                          {bookedForDay.length > 0 ? (
                            <>
                              {bookedForDay.slice(0, 3).map((slot) => {
                                const boatIdx = slot.boatId ? boatList.findIndex((b) => b.id === slot.boatId) : -1;
                                const boatColor = boatIdx >= 0 ? getBoatColor(boatIdx) : "rgb(59 130 246)";
                                return (
                                  <div
                                    key={slot.id}
                                    className="rounded-md border px-1.5 py-1 text-[10px] leading-tight shrink-0"
                                    style={{ borderColor: `${boatColor}99`, backgroundColor: `${boatColor}18`, borderLeftWidth: 3 }}
                                  >
                                    <span className="font-semibold" style={{ color: boatColor }}>{formatTime(slot.startAt)}</span>
                                    {(slot.bookingSummary?.boatName ?? boatList.find((b) => b.id === slot.boatId)?.name) && (
                                      <span className="block truncate opacity-90">{(slot.bookingSummary?.boatName ?? boatList.find((b) => b.id === slot.boatId)?.name)}</span>
                                    )}
                                    {slot.bookingSummary?.customerName && (
                                      <span className="block truncate opacity-80">{slot.bookingSummary.customerName}</span>
                                    )}
                                  </div>
                                );
                              })}
                              {bookedForDay.length > 3 && (
                                <span className="text-[10px] text-blue-600 font-medium">+{bookedForDay.length - 3} more</span>
                              )}
                            </>
                          ) : null}
                          {/* Summary line */}
                          {daySlots.length > 0 && (
                            <div className="mt-auto pt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-brand-muted">
                              {bookedCount > 0 && <span className="text-blue-600 font-medium">{bookedCount} booked</span>}
                              {openCount > 0 && <span>{openCount} available</span>}
                              {heldCount > 0 && <span className="text-amber-600">{heldCount} held</span>}
                              {blockedCount > 0 && <span>{blockedCount} blocked</span>}
                            </div>
                          )}
                          {daySlots.length === 0 && !isPast && <span className="text-[10px] italic text-brand-muted mt-auto">No slots</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          </div>

          {/* Day detail modal: timeline of time slots + bookings + actions */}
          <Dialog
        open={dayDetailOpen}
        onOpenChange={setDayDetailOpen}
        title={
          selectedDate
            ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : undefined
        }
        description={
          selectedDate && selectedDateSlots.length > 0
            ? `${selectedDateSlots.filter((s) => s.status === "booked").length} booked · ${selectedDateSlots.filter((s) => s.status === "open").length} available · ${selectedDateSlots.filter((s) => s.status === "held").length} held · ${selectedDateSlots.filter((s) => s.status === "blocked").length} blocked`
            : undefined
        }
      >
        <div className="space-y-4">
          {selectedDate && (
            <>
              {/* Block / unblock day */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDateSlots.some((s) => s.status === "open") && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => blockDate(selectedDate)}
                      disabled={!!blocking}
                      className="gap-1.5"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {blocking === `date-${selectedDate}` ? "Saving…" : "Block entire day"}
                    </Button>
                  )}
                  {selectedDateSlots.length > 0 && selectedDateSlots.every((s) => s.status === "blocked") && (
                    <Button
                      size="sm"
                      onClick={() => unblockDate(selectedDate)}
                      disabled={!!blocking}
                      className="gap-1.5"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      {blocking === `date-${selectedDate}` ? "Saving…" : "Unblock day"}
                    </Button>
                  )}
                </div>
                {selectedDateSlots.some((s) => s.status === "open") && boatList.length > 1 && (
                  <div className="rounded-lg border border-brand-dark/10 bg-brand-bg/20 px-3 py-2">
                    <p className="text-xs font-medium text-brand-muted mb-1.5">Block only these boats (leave unchecked to block all)</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {boatList.map((boat) => (
                        <label key={boat.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={blockDayBoatIds.has(boat.id)}
                            onChange={(e) => {
                              setBlockDayBoatIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(boat.id);
                                else next.delete(boat.id);
                                return next;
                              });
                            }}
                            className="rounded border-brand-dark/20"
                          />
                          {boat.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Time slots grouped by window, then by boat — cleaner than one row per slot */}
              <div className="border-t border-brand-dark/10 pt-4">
                <p className="mb-3 text-xs font-semibold text-brand-dark uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Time slots
                </p>
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  {selectedDateTimeGroups.map(({ key, slots, startAt }) => {
                    const parsed = parseSlotId(slots[0].id);
                    const duration = parsed ? `${parsed.durationHours}h` : "";
                    const timeLabel = `${formatTime(startAt)} – ${formatTime(slots[0].endAt)}${duration ? ` (${duration})` : ""}`;
                    return (
                      <div key={key} className="rounded-xl border border-brand-dark/10 bg-white overflow-hidden">
                        <div className="px-3 py-2 bg-brand-bg/50 border-b border-brand-dark/10">
                          <span className="font-semibold text-brand-dark tabular-nums text-sm">{timeLabel}</span>
                        </div>
                        <ul className="divide-y divide-brand-dark/5">
                          {slots.map((slot) => {
                            const isOpen = slot.status === "open";
                            const isBooked = slot.status === "booked";
                            const isHeld = slot.status === "held";
                            const isBlocked = slot.status === "blocked";
                            const summary = slot.bookingSummary;
                            const boatLabel = slot.boatId ? (boatNames.get(slot.boatId) ?? slot.boatId) : "—";
                            return (
                              <li
                                key={slot.boatId ? `${slot.id}-${slot.boatId}` : slot.id}
                                className={cn(
                                  "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5 text-sm",
                                  isOpen && "bg-emerald-50/40",
                                  isHeld && "bg-amber-50/40",
                                  isBooked && "bg-blue-50/40",
                                  isBlocked && "bg-brand-bg/30"
                                )}
                              >
                                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-brand-dark flex items-center gap-1.5">
                                    <Ship className="h-3.5 w-3.5 text-brand-muted shrink-0" />
                                    {boatLabel}
                                  </span>
                                  {slot.experienceId && experienceNames.has(slot.experienceId) && (
                                    <span className="text-xs text-brand-muted">
                                      {experienceNames.get(slot.experienceId)}
                                    </span>
                                  )}
                                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium shrink-0", SLOT_STATUS_CLASS[slot.status])}>
                                    {SLOT_LABELS[slot.status]}
                                  </span>
                                  {isBooked && summary && (
                                    <>
                                      <span className="text-xs text-brand-muted flex items-center gap-1">
                                        <User className="h-3 w-3" /> {summary.customerName || summary.customerEmail || "—"}
                                      </span>
                                      {summary.totalCents > 0 && (
                                        <span className="text-xs font-medium text-brand-primary">{formatCents(summary.totalCents)}</span>
                                      )}
                                    </>
                                  )}
                                  {isHeld && slot.expiresAt && (
                                    <span className="text-xs text-amber-700 tabular-nums">
                                      <HoldCountdown expiresAt={slot.expiresAt} label="Expires " compact />
                                    </span>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  {isOpen && (
                                    <Button variant="outline" size="sm" onClick={() => blockSlot(slot)} disabled={!!blocking}>
                                      {blocking === slot.id ? "Saving…" : "Block"}
                                    </Button>
                                  )}
                                  {isBlocked && (
                                    <Button size="sm" onClick={() => unblockSlot(slot)} disabled={!!actionLoading}>
                                      {actionLoading === slot.id ? "Saving…" : "Unblock"}
                                    </Button>
                                  )}
                                  {isHeld && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => releaseHold(slot.holdId!)}
                                      disabled={!!actionLoading || !slot.holdId}
                                      className="border-amber-300 text-amber-800 hover:bg-amber-50"
                                    >
                                      {actionLoading === slot.holdId ? "Releasing…" : "Release"}
                                    </Button>
                                  )}
                                  {isBooked && summary && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setBookingDetailId(summary.bookingId);
                                          setBookingDetailOpen(true);
                                        }}
                                      >
                                        View
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => cancelBooking(summary.bookingId)}
                                        disabled={!!actionLoading}
                                        className="border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
                                      >
                                        {actionLoading === summary.bookingId ? "Cancelling…" : "Cancel"}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                {selectedDateTimeGroups.length === 0 && (
                  <p className="py-8 text-center text-sm text-brand-muted">No time slots for this day.</p>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
        </>
      )}

          {/* Booking detail modal — full info + actions */}
          <Dialog
        open={bookingDetailOpen}
        onOpenChange={(open) => {
          setBookingDetailOpen(open);
          if (!open) setBookingDetailId(null);
        }}
        title="Booking details"
        description={bookingDetail ? `${bookingDetail.experienceName} · ${bookingDetail.startDate ?? ""} ${bookingDetail.startTime ?? ""}` : undefined}
      >
        <div className="space-y-4">
          {bookingDetailLoading && (
            <div className="py-8 text-center text-sm text-brand-muted">Loading…</div>
          )}
          {!bookingDetailLoading && bookingDetail && (
            <>
              <div className="grid gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">{bookingDetail.status}</span>
                  {bookingDetail.startDate && (
                    <span className="text-brand-dark">
                      {new Date(bookingDetail.startDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      {bookingDetail.startTime && bookingDetail.endTime && ` · ${bookingDetail.startTime} – ${bookingDetail.endTime}`}
                      {bookingDetail.durationHours != null && ` (${bookingDetail.durationHours}h)`}
                    </span>
                  )}
                </div>
                {bookingDetail.boatName && (
                  <p className="flex items-center gap-1.5 text-brand-dark">
                    <Ship className="h-4 w-4 text-brand-muted" /> {bookingDetail.boatName}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-brand-dark">
                  <span className="flex items-center gap-1.5"><User className="h-4 w-4 text-brand-muted" /> {bookingDetail.customer?.name || "—"}</span>
                  {bookingDetail.customer?.email && (
                    <a href={`mailto:${bookingDetail.customer.email}`} className="flex items-center gap-1.5 text-brand-primary hover:underline">
                      <Mail className="h-4 w-4" /> {bookingDetail.customer.email}
                    </a>
                  )}
                  {bookingDetail.customer?.phone && <span className="text-brand-muted">{bookingDetail.customer.phone}</span>}
                </div>
                {bookingDetail.partySize != null && (
                  <p className="text-brand-muted">Party: {bookingDetail.partySize} guest{bookingDetail.partySize !== 1 ? "s" : ""}{bookingDetail.petsCount > 0 ? ` · ${bookingDetail.petsCount} pet${bookingDetail.petsCount !== 1 ? "s" : ""}` : ""}</p>
                )}
                {bookingDetail.pricing?.totalCents != null && (
                  <p className="font-semibold text-brand-dark">{formatCents(bookingDetail.pricing.totalCents)}</p>
                )}
                {bookingDetail.addonsWithNames?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-brand-muted uppercase tracking-wide mb-1">Add-ons</p>
                    <ul className="list-disc list-inside text-brand-muted text-sm">
                      {bookingDetail.addonsWithNames.map((a) => (
                        <li key={a.addonId}>{a.name} × {a.qty}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bookingDetail.specialNotes && (
                  <div>
                    <p className="text-xs font-medium text-brand-muted uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm text-brand-dark whitespace-pre-wrap">{bookingDetail.specialNotes}</p>
                  </div>
                )}
              </div>
              <div className="border-t border-brand-dark/10 pt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (bookingDetail.stripe?.paymentIntentId) {
                      window.open(`https://dashboard.stripe.com/payments/${bookingDetail.stripe.paymentIntentId}`, "_blank");
                    }
                  }}
                  disabled={!bookingDetail.stripe?.paymentIntentId}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Refund in Stripe
                </Button>
                <Button variant="outline" size="sm" disabled className="gap-1.5" title="Coming soon">
                  <Mail className="h-3.5 w-3.5" /> Send email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Cancel this booking? The slot will become available.")) {
                      cancelBooking(bookingDetail.id);
                      setBookingDetailOpen(false);
                      setBookingDetailId(null);
                      fetchSlots();
                      fetchBookings();
                    }
                  }}
                  className="border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
                >
                  Cancel booking
                </Button>
              </div>
            </>
          )}
          {!bookingDetailLoading && !bookingDetail && bookingDetailId && (
            <p className="py-6 text-center text-sm text-brand-muted">Booking not found.</p>
          )}
        </div>
      </Dialog>
        </>
      )}
    </div>
  );
}
