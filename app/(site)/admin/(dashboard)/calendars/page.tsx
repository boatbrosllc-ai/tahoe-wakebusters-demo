"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTime, formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import Link from "next/link";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Clock, User, Ship, DollarSign, Lock, Unlock, Mail, ExternalLink, LayoutGrid, CalendarDays, FileCheck, Palette } from "lucide-react";
import { AdminCalendarWeekView } from "@/components/admin/AdminCalendarWeekView";
import { AddBookingModal } from "@/app/(site)/admin/(dashboard)/bookings/AddBookingModal";

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

/** Format slot start time in America/Chicago. Prefers slot id so display is correct even if startAt is wrong in DB. */
function formatSlotTime(slot: SlotDto): string {
  const parsed = parseSlotId(slot.id);
  if (parsed) {
    const { start } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute);
    return formatBookingTime(start);
  }
  return formatBookingTimeFromIso(slot.startAt);
}

/** Duration label for a slot, e.g. "2 hr" or "4 hr", from slot id or start/end times. */
function getSlotDurationLabel(slot: SlotDto): string {
  const parsed = parseSlotId(slot.id);
  if (parsed?.durationHours != null) {
    return parsed.durationHours === 1 ? "1 hr" : `${parsed.durationHours} hr`;
  }
  if (slot.startAt && slot.endAt) {
    const start = new Date(slot.startAt).getTime();
    const end = new Date(slot.endAt).getTime();
    const hours = (end - start) / (60 * 60 * 1000);
    if (hours > 0) {
      const h = Math.round(hours * 10) / 10;
      return h === 1 ? "1 hr" : `${h} hr`;
    }
  }
  return "";
}

function getMonthRange(month: Date): { start: string; end: string } {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 2, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

/** Calendar date YYYY-MM-DD for a slot — always from slot id (or local start time), never UTC from startAt. */
function getSlotCalendarDate(slot: SlotDto): string {
  if (slot.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(slot.dateStr)) return slot.dateStr;
  let parsed = parseSlotId(slot.id);
  if (parsed) return parsed.dateStr;
  // Relaxed: single-digit month/day (e.g. 2026-2-13-13-4)
  const cleaned = slot.id.trim().replace(/\s/g, "");
  if (/^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const parts = cleaned.split("-");
    const norm = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}`;
    parsed = parseSlotId(norm);
    if (parsed) return parsed.dateStr;
  }
  const parts = slot.id.trim().split("-");
  if (parts.length >= 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    const s = `${y}-${m}-${d}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  // Fallback: use local date of startAt so UTC doesn't shift the day (e.g. 1 PM Central = Feb 14 00:00 UTC)
  const startDate = new Date(slot.startAt);
  return `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
}

const SLOT_STATUS_CLASS: Record<SlotStatus, string> = {
  open: "bg-emerald-100 text-emerald-800 border-emerald-300",
  held: "bg-amber-100 text-amber-800 border-amber-300",
  booked: "bg-sky-100 text-sky-800 border-sky-300",
  blocked: "bg-slate-100 text-slate-600 border-slate-200",
};

const SLOT_LABELS: Record<SlotStatus, string> = {
  open: "Available",
  held: "Held (checkout)",
  booked: "Booked",
  blocked: "Blocked",
};

/** Status colors for legend and calendar. */
const STATUS_COLORS = {
  open: { bg: "rgb(16 185 129)", text: "rgb(5 46 22)", label: "Available" },
  booked: { bg: "rgb(14 165 233)", text: "rgb(3 7 18)", label: "Booked" },
  held: { bg: "rgb(245 158 11)", text: "rgb(120 53 15)", label: "Held" },
  blocked: { bg: "rgb(100 116 139)", text: "rgb(30 41 59)", label: "Blocked" },
} as const;

/** Rich, distinct default boat colors (cycle by boat index). */
const BOAT_COLORS = [
  "rgb(20 184 166)",   // teal – brand-aligned
  "rgb(244 63 94)",   // rose
  "rgb(245 158 11)",  // amber
  "rgb(139 92 246)",  // violet
  "rgb(14 165 233)",  // sky
  "rgb(16 185 129)",  // emerald
];
function getBoatColor(boatIndex: number): string {
  return BOAT_COLORS[boatIndex % BOAT_COLORS.length] ?? BOAT_COLORS[0];
}

const CALENDAR_BOAT_COLORS_KEY = "admin-calendar-boat-colors";

/** rgb(r g b) -> #rrggbb for input[type=color] */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/);
  if (!m) return "#14b8a6";
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** #rrggbb -> rgb(r g b) for CSS */
function hexToRgb(hex: string): string {
  const m = hex.replace(/^#/, "").match(/(.{2})(.{2})(.{2})/);
  if (!m) return BOAT_COLORS[0];
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgb(${r} ${g} ${b})`;
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
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeBoatId, setRangeBoatId] = useState("");
  const [rangeSelectStep, setRangeSelectStep] = useState<"from" | "to">("from");
  const [rangePickerMonth, setRangePickerMonth] = useState<Date>(() => new Date());
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
    waiver?: { requestId: string; status: string; templateId: string; templateVersion: number };
  } | null>(null);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  /** User-assigned boat colors (boatId -> rgb). Persisted in localStorage. */
  const [boatColors, setBoatColors] = useState<Record<string, string>>({});
  const [boatColorsSectionOpen, setBoatColorsSectionOpen] = useState(false);

  /** Resolve color for a boat: custom if set, else default by index. */
  const getBoatColorResolved = useCallback(
    (boatId: string, boatIndex: number) => boatColors[boatId] ?? getBoatColor(boatIndex),
    [boatColors]
  );

  /** Load boat colors from localStorage on mount. */
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(CALENDAR_BOAT_COLORS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === "object") setBoatColors(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const setBoatColor = useCallback((boatId: string, color: string | null) => {
    setBoatColors((prev) => {
      const next = color ? { ...prev, [boatId]: color } : { ...prev };
      if (!color) delete next[boatId];
      try {
        localStorage.setItem(CALENDAR_BOAT_COLORS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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
      else if (s.status === "booked" && s.bookingSummary) entry.booked++;
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

  /** Compact day grid for range picker (no slot counts). */
  const rangePickerDays = useMemo(() => {
    const year = rangePickerMonth.getFullYear();
    const month = rangePickerMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isPast: boolean }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      cells.push({ dateStr: toDateStr(d), day: d.getDate(), isCurrentMonth: false, isPast: toDateStr(d) < todayStr });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ dateStr, day, isCurrentMonth: true, isPast: dateStr < todayStr });
    }
    for (let i = 1; i <= totalCells - cells.length; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({ dateStr: toDateStr(d), day: d.getDate(), isCurrentMonth: false, isPast: true });
    }
    return cells;
  }, [rangePickerMonth, todayStr]);

  useEffect(() => {
    if (boatList.length === 1 && !rangeBoatId) setRangeBoatId(boatList[0].id);
  }, [boatList, rangeBoatId]);

  useEffect(() => {
    if (rangeSectionOpen) setRangePickerMonth(calendarMonth);
  }, [rangeSectionOpen, calendarMonth]);

  /** Slots that have a booking (booked or blocked with a booking) — shown on each calendar day card. */
  /** Only slots that have a confirmed booking in our bookings list (single source of truth). */
  const bookedSlotsByDay = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of filteredSlots) {
      if (!s.bookingSummary) continue;
      const day = getSlotCalendarDate(s);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    map.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [filteredSlots]);

  /** One slot per booking per day (deduplicated) — avoids duplicate rows when one booking has multiple experience slots. */
  const uniqueBookedSlotsByDay = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    bookedSlotsByDay.forEach((slots, day) => {
      const seen = new Set<string>();
      const unique: SlotDto[] = [];
      for (const s of slots) {
        const key = s.bookingId ?? s.bookingSummary?.bookingId ?? s.id;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(s);
      }
      map.set(day, unique);
    });
    return map;
  }, [bookedSlotsByDay]);

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
    if (boatList.length > 0 && !rangeBoatId) {
      setError("Please select a boat.");
      return;
    }
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (start > end) {
      setError("Start date must be before end date.");
      return;
    }
    setRangeLoading(true);
    setError(null);
    try {
      const boatIds = rangeBoatId ? [rangeBoatId] : undefined;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toDateStr(d);
        if (dateStr < todayStr) continue;
        for (const experienceId of uniqueExperienceIds) {
          const res = await fetch("/api/booking/block-date", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ experienceId, date: dateStr, action: "block", boatIds }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Failed to block date");
        }
      }
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block range");
    } finally {
      setRangeLoading(false);
    }
  };

  const handleRangePickerDateClick = (dateStr: string) => {
    if (rangeSelectStep === "from") {
      setRangeStart(dateStr);
      setRangeEnd(dateStr);
      setRangeSelectStep("to");
    } else {
      if (dateStr < rangeStart) {
        setRangeEnd(rangeStart);
        setRangeStart(dateStr);
      } else {
        setRangeEnd(dateStr);
      }
      setRangeSelectStep("from");
    }
  };

  const unblockRange = async () => {
    if (uniqueExperienceIds.length === 0 || !rangeStart || !rangeEnd) return;
    if (boatList.length > 0 && !rangeBoatId) {
      setError("Please select a boat.");
      return;
    }
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (start > end) {
      setError("Start date must be before end date.");
      return;
    }
    setRangeLoading(true);
    setError(null);
    try {
      const boatIds = rangeBoatId ? [rangeBoatId] : undefined;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toDateStr(d);
        for (const experienceId of uniqueExperienceIds) {
          const res = await fetch("/api/booking/block-date", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ experienceId, date: dateStr, action: "unblock", boatIds }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Failed to unblock date");
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
          onClick={() => setAddBookingOpen(true)}
          className="shrink-0 gap-1.5"
        >
          <CalendarIcon className="h-4 w-4" />
          Add booking
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

          {/* Boat colors: assign a color to each boat (collapsible) */}
          {boatList.length > 0 && (
            <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
              <button
                type="button"
                onClick={() => setBoatColorsSectionOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 sm:px-6 text-left text-sm font-medium text-brand-dark hover:bg-brand-bg/30 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-brand-primary" aria-hidden />
                  Boat colors
                </span>
                {boatColorsSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {boatColorsSectionOpen && (
                <div className="border-t border-brand-dark/10 px-4 py-4 sm:px-6 sm:py-4">
                  <p className="text-xs text-brand-muted mb-4">
                    Choose a color for each boat. Colors are used on the calendar and week view. Saved in this browser.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boatList.map((boat, idx) => {
                      const defaultRgb = getBoatColor(idx);
                      const currentRgb = boatColors[boat.id] ?? defaultRgb;
                      const hex = rgbToHex(currentRgb);
                      const colorInputId = `boat-color-${boat.id}`;
                      return (
                        <div
                          key={boat.id}
                          className="flex items-center gap-3 rounded-xl border border-brand-dark/10 bg-brand-bg/30 p-3"
                        >
                          <label
                            htmlFor={colorInputId}
                            className="h-10 w-10 rounded-xl border-2 border-white shadow-md cursor-pointer shrink-0 ring-2 ring-brand-dark/10 hover:ring-brand-primary/40 transition-all flex items-center justify-center"
                            style={{ backgroundColor: currentRgb }}
                            title="Click to change color"
                          >
                            <input
                              id={colorInputId}
                              type="color"
                              value={hex}
                              onChange={(e) => setBoatColor(boat.id, hexToRgb(e.target.value))}
                              className="sr-only"
                              aria-label={`Color for ${boat.name}`}
                            />
                            <span className="sr-only">Pick color for {boat.name}</span>
                          </label>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-brand-dark truncate">{boat.name}</p>
                            <button
                              type="button"
                              onClick={() => setBoatColor(boat.id, null)}
                              className="text-xs text-brand-muted hover:text-brand-primary mt-0.5"
                            >
                              Reset to default
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Boat filter: multi-select with strong color coding */}
          {boatList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-brand-muted">Boats</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedBoatIds(new Set())}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium border-2 transition-all",
                    selectedBoatIds.size === 0
                      ? "bg-brand-primary/20 text-brand-primary border-brand-primary shadow-sm"
                      : "bg-white border-brand-dark/15 text-brand-dark hover:border-brand-dark/30"
                  )}
                >
                  All
                </button>
                {boatList.map((boat, idx) => {
                  const color = getBoatColorResolved(boat.id, idx);
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
                        "rounded-full pl-2 pr-4 py-2 text-sm font-medium border-2 transition-all flex items-center gap-2",
                        isSelected ? "shadow-md" : "bg-white border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                      )}
                      style={
                        isSelected
                          ? { borderColor: color, color, backgroundColor: `${color}22`, boxShadow: `0 0 0 1px ${color}40` }
                          : undefined
                      }
                    >
                      <span
                        className="h-3 w-3 rounded-full shrink-0 ring-2 ring-white"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
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
              boatColorByIndex={boatList.reduce<Record<number, string>>((acc, _, i) => ({ ...acc, [i]: getBoatColorResolved(boatList[i].id, i) }), {})}
              onPrevWeek={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })}
              onNextWeek={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })}
              onBookingClick={(bookingId) => { setBookingDetailId(bookingId); setBookingDetailOpen(true); }}
              onRefresh={() => { fetchSlots(); fetchBookings(); }}
            />
          ) : (
          <>
          {/* Quick actions: block range (collapsible) — boat → calendar clicks → Block/Unblock */}
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
              <div className="border-t border-brand-dark/10 px-4 py-4 sm:px-6 sm:py-4 space-y-4">
                {boatList.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-brand-muted mb-2">1. Click boat</p>
                    <div className="flex flex-wrap gap-2">
                      {boatList.map((boat) => (
                        <button
                          key={boat.id}
                          type="button"
                          onClick={() => setRangeBoatId(boat.id)}
                          className={cn(
                            "rounded-full px-4 py-2 text-sm font-medium border-2 transition-colors",
                            rangeBoatId === boat.id
                              ? "bg-brand-primary text-white border-brand-primary"
                              : "bg-white border-brand-dark/20 text-brand-dark hover:border-brand-primary/50 hover:bg-brand-primary/5"
                          )}
                        >
                          {boat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-brand-muted mb-2">2. Click start date, then end date</p>
                  <div className="inline-block rounded-xl border border-brand-dark/10 bg-brand-bg/30 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-brand-dark">
                        {rangePickerMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setRangePickerMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                          className="p-1.5 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-white"
                          aria-label="Previous month"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => setRangePickerMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                          className="p-1.5 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-white"
                          aria-label="Next month"
                        >
                          →
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div key={i} className="text-center text-[10px] font-semibold text-brand-muted py-0.5">
                          {d}
                        </div>
                      ))}
                      {rangePickerDays.map((cell) => {
                        const isInRange =
                          rangeStart &&
                          rangeEnd &&
                          cell.dateStr >= rangeStart &&
                          cell.dateStr <= rangeEnd &&
                          cell.isCurrentMonth;
                        const isStart = rangeStart && cell.dateStr === rangeStart;
                        const isEnd = rangeEnd && cell.dateStr === rangeEnd;
                        return (
                          <button
                            key={cell.dateStr + cell.day}
                            type="button"
                            onClick={() => !cell.isPast && handleRangePickerDateClick(cell.dateStr)}
                            disabled={cell.isPast}
                            className={cn(
                              "min-w-[28px] h-8 rounded-md text-sm font-medium transition-colors",
                              cell.isPast && "text-brand-muted/50 cursor-not-allowed",
                              !cell.isPast && "hover:bg-brand-primary/20 text-brand-dark cursor-pointer",
                              cell.isCurrentMonth ? "text-brand-dark" : "text-brand-muted/70",
                              isInRange && "bg-brand-primary/25 text-brand-dark",
                              (isStart || isEnd) && "ring-2 ring-brand-primary bg-brand-primary/40 font-bold"
                            )}
                          >
                            {cell.day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {rangeStart && rangeEnd && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="text-sm text-brand-muted">
                      {rangeStart === rangeEnd
                        ? new Date(rangeStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : `${new Date(rangeStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(rangeEnd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </span>
                    <Button variant="outline" size="sm" onClick={blockRange} disabled={rangeLoading || (boatList.length > 0 && !rangeBoatId)}>
                      {rangeLoading ? "Saving…" : "Block range"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={unblockRange} disabled={rangeLoading || (boatList.length > 0 && !rangeBoatId)}>
                      {rangeLoading ? "Saving…" : "Unblock range"}
                    </Button>
                  </div>
                )}
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
              {/* Legend: status pills + boat swatches */}
              <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted shrink-0">Status</span>
                  {(Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]).map((status) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-black/10 shadow-sm"
                      style={{
                        backgroundColor: `${STATUS_COLORS[status].bg}20`,
                        color: STATUS_COLORS[status].text,
                        borderColor: `${STATUS_COLORS[status].bg}60`,
                      }}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[status].bg }} aria-hidden />
                      {STATUS_COLORS[status].label}
                    </span>
                  ))}
                  {boatList.length > 1 && (
                    <>
                      <span className="w-px h-5 bg-brand-dark/20 shrink-0" aria-hidden />
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted shrink-0">Boats</span>
                      {boatList.map((boat, idx) => {
                        const c = getBoatColorResolved(boat.id, idx);
                        return (
                          <span
                            key={boat.id}
                            className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1 text-xs font-medium border border-black/10 shadow-sm"
                            style={{
                              backgroundColor: `${c}18`,
                              color: c,
                              borderColor: `${c}50`,
                            }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/80" style={{ backgroundColor: c }} aria-hidden />
                            {boat.name}
                          </span>
                        );
                      })}
                    </>
                  )}
                </div>
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
                    const bookedForDay = uniqueBookedSlotsByDay.get(cell.dateStr) ?? [];
                    const isPast = cell.isPast;
                    const isToday = cell.isCurrentMonth && cell.dateStr === todayStr;
                    const cellBusy = blocking === `date-${cell.dateStr}`;
                    return (
                      <div
                        key={cell.dateStr + cell.day}
                        onClick={(e) => {
                          if (isPast || cellBusy) return;
                          handleDateCellClick(cell, e);
                        }}
                        title={isPast ? "Past" : "View day"}
                        className={cn(
                          "min-h-[140px] sm:min-h-[160px] flex flex-col rounded-xl border p-2 text-left transition-all overflow-hidden relative",
                          "hover:shadow-md hover:ring-1 hover:ring-brand-primary/30",
                          cell.isCurrentMonth ? "text-brand-dark" : "text-brand-muted/70",
                          isPast && "cursor-not-allowed bg-slate-50 opacity-85 border-slate-200",
                          !isPast && "cursor-pointer bg-white border-brand-dark/10",
                          isToday && !isPast && "ring-2 ring-brand-primary bg-brand-primary/8",
                          cellBusy && "opacity-70 pointer-events-none"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5 shrink-0">
                          <span className={cn("text-sm font-bold tabular-nums", isToday ? "text-brand-primary" : "text-brand-dark")}>
                            {cell.day}
                          </span>
                          {isToday && !isPast && (
                            <span className="text-[10px] font-semibold text-brand-primary bg-brand-primary/15 px-1.5 py-0.5 rounded">Today</span>
                          )}
                        </div>
                        {/* Bookings first — what matters most */}
                        <div className="flex flex-col gap-1 flex-1 min-h-0">
                          {bookedForDay.length > 0 ? (
                            <>
                              {bookedForDay.slice(0, 3).map((slot, idx) => {
                                const boatIdx = slot.boatId ? boatList.findIndex((b) => b.id === slot.boatId) : -1;
                                const boatColor = boatIdx >= 0 ? getBoatColorResolved(boatList[boatIdx].id, boatIdx) : STATUS_COLORS.booked.bg;
                                const cellKey = `${slot.id}-${slot.boatId ?? "n"}-${slot.experienceId ?? "n"}-${slot.bookingId ?? "n"}-${idx}`;
                                const bookingId = slot.bookingSummary?.bookingId ?? slot.bookingId;
                                return (
                                  <button
                                    key={cellKey}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (bookingId) {
                                        setBookingDetailId(bookingId);
                                        setBookingDetailOpen(true);
                                      }
                                    }}
                                    className="w-full text-left rounded-lg border-l-4 px-2 py-1.5 text-[10px] leading-tight shrink-0 font-medium shadow-sm hover:opacity-90 transition-opacity"
                                    style={{
                                      borderLeftColor: boatColor,
                                      backgroundColor: `${boatColor}15`,
                                      color: "rgb(15 23 42)",
                                    }}
                                    title={bookingId ? "View booking details" : undefined}
                                  >
                                    <span className="font-bold tabular-nums" style={{ color: boatColor }}>{formatSlotTime(slot)}{getSlotDurationLabel(slot) ? ` · ${getSlotDurationLabel(slot)}` : ""}</span>
                                    {(slot.bookingSummary?.boatName ?? boatList.find((b) => b.id === slot.boatId)?.name) && (
                                      <span className="block truncate opacity-90 text-brand-dark">{(slot.bookingSummary?.boatName ?? boatList.find((b) => b.id === slot.boatId)?.name)}</span>
                                    )}
                                    {slot.bookingSummary?.customerName && (
                                      <span className="block truncate opacity-80 text-brand-muted">{slot.bookingSummary.customerName}</span>
                                    )}
                                  </button>
                                );
                              })}
                              {bookedForDay.length > 3 && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openDayDetail(cell.dateStr); }}
                                  className="text-[10px] font-semibold text-left w-full"
                                  style={{ color: STATUS_COLORS.booked.bg }}
                                >
                                  +{bookedForDay.length - 3} more — view day
                                </button>
                              )}
                            </>
                          ) : null}
                          {daySlots.length === 0 && !isPast && <span className="text-[10px] italic text-brand-muted mt-auto">No slots</span>}
                        </div>
                      </div>
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
        description={selectedDate ? "Bookings and time slots for this day." : undefined}
      >
        <div className="space-y-4">
          {selectedDate && (
            <>
              {/* Bookings on this day — click to open full details */}
              <div className="border-t border-brand-dark/10 pt-4">
                <p className="mb-3 text-xs font-semibold text-brand-dark uppercase tracking-wide flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Bookings on this day
                </p>
                {(() => {
                  const dayBookings = uniqueBookedSlotsByDay.get(selectedDate) ?? [];
                  if (dayBookings.length === 0) {
                    return (
                      <p className="py-4 text-center text-sm text-brand-muted rounded-xl bg-brand-bg/30 border border-brand-dark/10">
                        No bookings yet. Use &quot;Add booking&quot; below or block the day if needed.
                      </p>
                    );
                  }
                  return (
                    <ul className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                      {dayBookings.map((slot) => {
                        const summary = slot.bookingSummary;
                        const bookingId = summary?.bookingId ?? slot.bookingId;
                        const boatIdx = slot.boatId ? boatList.findIndex((b) => b.id === slot.boatId) : -1;
                        const boatColor = boatIdx >= 0 ? getBoatColorResolved(boatList[boatIdx].id, boatIdx) : STATUS_COLORS.booked.bg;
                        const expName = slot.experienceId && experienceNames.has(slot.experienceId) ? experienceNames.get(slot.experienceId) : null;
                        return (
                          <li
                            key={bookingId ?? `${slot.id}-${slot.boatId ?? "n"}-${slot.experienceId ?? "n"}`}
                            className={cn(
                              "rounded-xl border-2 border-brand-dark/10 bg-white overflow-hidden transition-colors",
                              bookingId && "hover:border-brand-primary/30 hover:shadow-sm cursor-pointer"
                            )}
                          >
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3"
                              onClick={() => {
                                if (bookingId) {
                                  setBookingDetailId(bookingId);
                                  setBookingDetailOpen(true);
                                }
                              }}
                            >
                              <span className="shrink-0 h-2 w-2 rounded-full" style={{ backgroundColor: boatColor }} aria-hidden />
                              <span className="font-semibold text-brand-dark tabular-nums text-sm">{formatSlotTime(slot)}</span>
                              {getSlotDurationLabel(slot) && (
                                <span className="text-xs text-brand-muted font-normal">· {getSlotDurationLabel(slot)}</span>
                              )}
                              {expName && <span className="text-xs text-brand-muted">{expName}</span>}
                              <span className="text-sm text-brand-dark">
                                {summary?.boatName ?? (slot.boatId ? boatNames.get(slot.boatId) ?? slot.boatId : "—")}
                              </span>
                              {summary && (
                                <>
                                  <span className="text-xs text-brand-muted flex items-center gap-1">
                                    <User className="h-3 w-3" /> {summary.customerName || summary.customerEmail || "—"}
                                  </span>
                                  {summary.totalCents > 0 && (
                                    <span className="text-xs font-medium text-brand-primary ml-auto">{formatCents(summary.totalCents)}</span>
                                  )}
                                </>
                              )}
                            </button>
                            {bookingId && summary && (
                              <div className="px-3 pb-2 pt-0 flex items-center gap-2 border-t border-brand-dark/5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setBookingDetailId(bookingId);
                                    setBookingDetailOpen(true);
                                  }}
                                >
                                  View details
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => cancelBooking(bookingId)}
                                  disabled={!!actionLoading}
                                  className="border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
                                >
                                  {actionLoading === bookingId ? "Cancelling…" : "Cancel booking"}
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>

              {/* Block day / Add booking */}
              <div className="border-t border-brand-dark/10 pt-4 space-y-3">
                <p className="text-xs font-semibold text-brand-dark uppercase tracking-wide">Actions</p>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddBookingOpen(true)}
                    className="gap-1.5"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Add booking
                  </Button>
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
        title={bookingDetail ? "Booking details" : bookingDetailId ? "Booking not found" : "Booking details"}
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
                  <p className="text-brand-muted">Party: {bookingDetail.partySize} guest{bookingDetail.partySize !== 1 ? "s" : ""}</p>
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
                {bookingDetail.waiver && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-1.5 flex items-center gap-1.5">
                      <FileCheck className="h-3.5 w-3.5" aria-hidden /> Waiver
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          bookingDetail.waiver.status === "signed"
                            ? "bg-green-100 text-green-800"
                            : bookingDetail.waiver.status === "pending"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {bookingDetail.waiver.status === "signed" ? "Signed" : bookingDetail.waiver.status}
                      </span>
                      <Link
                        href={`/admin/waivers/requests/${bookingDetail.waiver.requestId}`}
                        className="text-sm text-brand-primary hover:underline"
                      >
                        View request
                      </Link>
                      {bookingDetail.waiver.status === "signed" && (
                        <a
                          href={`/api/waiver/pdf/${bookingDetail.waiver.requestId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-brand-primary hover:underline"
                        >
                          View PDF
                        </a>
                      )}
                    </div>
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
            <div className="py-6 text-center space-y-4">
              <p className="text-sm text-brand-muted">
                This slot is linked to a booking that no longer exists. It may have been canceled or deleted.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBookingDetailOpen(false);
                  setBookingDetailId(null);
                }}
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </Dialog>
        </>
      )}

      <AddBookingModal
        open={addBookingOpen}
        onOpenChange={setAddBookingOpen}
        onSuccess={() => {
          fetchBookings();
          fetchSlots();
        }}
      />
    </div>
  );
}
