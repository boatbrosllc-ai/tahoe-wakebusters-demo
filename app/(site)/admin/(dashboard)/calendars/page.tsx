/**
 * Admin calendar (month grid + week view). External calendar apps can subscribe to confirmed bookings via
 * GET /api/booking/calendar.ics (see route; requires BOOKING_CALENDAR_FEED_SECRET and query params).
 */
"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { buildSlotId, getDateStrInSlotTimezone, getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTime, formatBookingTimeFromIso, formatBookingDate } from "@/lib/booking/format-booking-datetime";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { bumpSlotCacheVersion } from "@/lib/booking/booking-data-cache";
import Link from "next/link";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, User, Ship, DollarSign, Lock, Unlock, Mail, ExternalLink, LayoutGrid, CalendarDays, FileCheck, Palette, Ban, Plus, Trash2, RefreshCw } from "lucide-react";
import { AdminCalendarWeekView } from "@/components/admin/AdminCalendarWeekView";
import { AddBookingModal } from "@/app/(site)/admin/(dashboard)/bookings/AddBookingModal";
import {
  bookingCardDisplayTime,
  bookingCardDurationHours,
  formatDurationHoursLabel,
  pickCanonicalBookingSlotRow as pickCanonicalBookingSlotRowHelper,
} from "@/lib/admin/calendar-booking-card";

type SlotStatus = "open" | "held" | "booked" | "blocked";

interface BookingSummary {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  boatName: string | null;
  totalCents: number;
  status: string;
  /** Canonical trip fields from booking doc (same source as booking detail modal). */
  slotId?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationHours?: number | null;
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
  /** Ticketed experience capacity fields — only present on real ticketed slots from the slots API */
  maxCapacity?: number;
  spotsBooked?: number;
  spotsRemaining?: number;
  /** Charter: true trip length when this grid row is a shorter tier overlapped by the booking (see slots API). */
  bookingDurationHours?: number;
}

function toDateStr(d: Date): string {
  return getDateStrInSlotTimezone(d);
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

/** Booking cards: use canonical booking trip time, not overlap grid row slot id. */
function formatBookingCardTime(slot: SlotDto): string {
  return bookingCardDisplayTime(slot, formatSlotTime);
}

/** Duration label for a slot, e.g. "2 hr" or "4 hr", from slot id or start/end times. */
function getSlotDurationLabel(slot: SlotDto): string {
  if (typeof slot.bookingDurationHours === "number" && slot.bookingDurationHours > 0) {
    const h = slot.bookingDurationHours;
    return h === 1 ? "1 hr" : `${h} hr`;
  }
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

/** Booking cards: duration from booking doc when available. */
function getBookingCardDurationLabel(slot: SlotDto): string {
  const hours = bookingCardDurationHours(slot);
  if (hours != null) return formatDurationHoursLabel(hours);
  return getSlotDurationLabel(slot);
}

function pickCanonicalBookingSlotRow(existing: SlotDto, candidate: SlotDto): SlotDto {
  return pickCanonicalBookingSlotRowHelper(existing, candidate);
}

/** Chicago calendar-day bounds used by admin full-day block / unblock (matches block-date API). */
function getCentralFullDayBoundsMs(dateStr: string): { startMs: number; endMs: number } {
  const { start } = getSlotStartEnd(dateStr, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function blockSegmentOnCentralDay(
  startIso: string,
  endIso: string,
  dateStr: string
): { clipStart: Date; clipEnd: Date } | null {
  const { start: ds } = getSlotStartEnd(dateStr, 0, 0, 0);
  const de = new Date(ds.getTime() + 24 * 60 * 60 * 1000 - 1);
  const s = new Date(startIso);
  const e = new Date(endIso);
  const clipStart = new Date(Math.max(s.getTime(), ds.getTime()));
  const clipEnd = new Date(Math.min(e.getTime(), de.getTime()));
  if (clipStart.getTime() >= clipEnd.getTime()) return null;
  return { clipStart, clipEnd };
}

function isSingleCentralFullDayBlock(startAtIso: string, endAtIso: string): boolean {
  const sDay = getDateStrInSlotTimezone(new Date(startAtIso));
  const eDay = getDateStrInSlotTimezone(new Date(endAtIso));
  if (sDay !== eDay) return false;
  const { startMs, endMs } = getCentralFullDayBoundsMs(sDay);
  return new Date(startAtIso).getTime() === startMs && new Date(endAtIso).getTime() === endMs;
}

/** True when this block’s coverage on `dateStr` is not the entire Chicago calendar day (incl. slot-tied blocks). */
function isNonFullDayBlockOnDate(
  block: { slotId?: string | null; startAt: string; endAt: string },
  dateStr: string
): boolean {
  if (block.slotId) return true;
  const seg = blockSegmentOnCentralDay(block.startAt, block.endAt, dateStr);
  if (!seg) return false;
  const { startMs, endMs } = getCentralFullDayBoundsMs(dateStr);
  return !(seg.clipStart.getTime() === startMs && seg.clipEnd.getTime() === endMs);
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

/** Chicago wall time and 10-minute step for admin block `<input type="datetime-local" />` fields. */
const BLOCK_DATETIME_LOCAL_STEP_SECONDS = 600;

function formatDateAsCentralDatetimeLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year");
  const mo = get("month").padStart(2, "0");
  const da = get("day").padStart(2, "0");
  const hr = get("hour").padStart(2, "0");
  const min = get("minute").padStart(2, "0");
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(mo) || !/^\d{2}$/.test(da)) return "";
  return `${y}-${mo}-${da}T${hr}:${min}`;
}

/**
 * Parse `datetime-local` value as an instant using Chicago wall time via `getSlotStartEnd`.
 * Accepts single-digit month/day/hour/minute and optional seconds (browser variants).
 */
function parseCentralDatetimeLocalInput(s: string): Date {
  const trimmed = s.trim();
  const tIdx = trimmed.indexOf("T");
  if (tIdx === -1) return new Date(NaN);
  const datePart = trimmed.slice(0, tIdx);
  const timePart = trimmed.slice(tIdx + 1);
  const dm = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dm) return new Date(NaN);
  const normalizedDate = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
  const tm = timePart.match(/^(\d{1,2}):(\d{1,2})/);
  if (!tm) return new Date(NaN);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return new Date(NaN);
  const { start } = getSlotStartEnd(normalizedDate, hour, 0, minute);
  return start;
}

const SLOT_STATUS_CLASS: Record<SlotStatus, string> = {
  open: "bg-emerald-100 text-emerald-800 border-emerald-300",
  held: "bg-amber-100 text-amber-800 border-amber-300",
  booked: "bg-sky-100 text-sky-800 border-sky-300",
  blocked: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Preset durations for “Block a boat time” length chips (hours). */
const QUICK_BLOCK_LENGTH_PRESET_HOURS = [1, 2, 3, 4, 6] as const;

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

/** rgb(r g b) -> rgba(...) for translucent chip/pill backgrounds. */
function rgbWithAlpha(rgb: string, alpha: number): string {
  const m = rgb.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/);
  if (!m) return rgb;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

/** Boat with experienceIds for block-by-experience logic. Optional color (hex) from boat document for calendar. */
interface BoatItem {
  id: string;
  name: string;
  experienceIds: string[];
  color?: string;
}

export default function CalendarsPage() {
  /** Map from experience slug or doc id to Firestore document id (so we always call slots API with doc id). */
  const [experienceDocIdBySlugOrId, setExperienceDocIdBySlugOrId] = useState<Map<string, string>>(new Map());
  const [boatList, setBoatList] = useState<BoatItem[]>([]);
  const [experienceNames, setExperienceNames] = useState<Map<string, string>>(new Map());
  /** Firestore IDs of ticketed experiences (kept for slot/booking grouping; calendar includes all listings). */
  const [ticketedExperienceIds, setTicketedExperienceIds] = useState<Set<string>>(new Set());
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [bookingsBySlotId, setBookingsBySlotId] = useState<Map<string, BookingSummary>>(new Map());
  /** Secondary map keyed by slotId string — used to enrich real ticketed slots that have bookingId=null. */
  const [bookingsBySlotKey, setBookingsBySlotKey] = useState<Map<string, BookingSummary>>(new Map());
  /** Synthetic SlotDto rows built from bookings for experiences (e.g. ticketed) whose slots API doesn't emit per-booking rows. */
  const [syntheticBookingSlots, setSyntheticBookingSlots] = useState<SlotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
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
  const [rangeExperienceId, setRangeExperienceId] = useState("");
  const [rangeTicketsHeld, setRangeTicketsHeld] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  /** Collapsed by default so a long block list does not push the calendar off-screen. */
  const [blocksListOpen, setBlocksListOpen] = useState(false);
  const [blocks, setBlocks] = useState<
    { id: string; boatId: string | null; startAt: string; endAt: string; note: string | null; slotId?: string | null; ticketsBlocked?: number | null }[]
  >([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ level: "success" | "warning"; message: string } | null>(null);
  /** Confirms destructive calendar actions (block/unblock date or slot, release hold) before calling APIs. */
  const [calendarActionConfirm, setCalendarActionConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
    /** Optional controls shown between description and action buttons */
    children?: ReactNode;
  } | null>(null);
  const [calendarActionConfirmBusy, setCalendarActionConfirmBusy] = useState(false);
  /** Read when confirming unblock date — avoids stale state in async run. */
  const unblockIncludePartialRef = useRef(false);
  const unblockDialogRenderKey = useRef(0);
  const [boatNames, setBoatNames] = useState<Map<string, string>>(new Map());
  const [blockDayBoatIds, setBlockDayBoatIds] = useState<Set<string>>(new Set());
  /** Day modal: quick block one boat for a chosen range (POST /api/admin/blocks). */
  const [quickBlockExperienceId, setQuickBlockExperienceId] = useState("");
  const [quickBlockBoatId, setQuickBlockBoatId] = useState("");
  const [quickBlockStart, setQuickBlockStart] = useState("");
  const [quickBlockEnd, setQuickBlockEnd] = useState("");
  const [quickBlockNote, setQuickBlockNote] = useState("");
  /** Ticketed listings: hold back N tickets instead of closing the whole departure. */
  const [quickBlockTicketsHeld, setQuickBlockTicketsHeld] = useState("");
  const [quickBlockSaving, setQuickBlockSaving] = useState(false);
  const [quickBlockError, setQuickBlockError] = useState<string | null>(null);
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
    slotId?: string | null;
    startDate: string | null;
    startTime: string | null;
    endTime: string | null;
    durationHours: number | null;
    stripe?: { paymentIntentId?: string };
    waiver?: { requestId: string; status: string; templateId: string; templateVersion: number };
  } | null>(null);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [cancelCalConfirmOpen, setCancelCalConfirmOpen] = useState(false);
  const [cancelCalRefund, setCancelCalRefund] = useState(true);
  const [cancelCalOverride, setCancelCalOverride] = useState(false);
  const [cancelCalNoRefundWarn, setCancelCalNoRefundWarn] = useState<string | null>(null);
  const [cancelCalPendingId, setCancelCalPendingId] = useState<string | null>(null);
  const [cancelCalLoading, setCancelCalLoading] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleHour, setRescheduleHour] = useState("7");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleConfirmPricing, setRescheduleConfirmPricing] = useState(false);
  /** User-assigned boat colors (boatId -> rgb). Persisted in localStorage. */
  const [boatColors, setBoatColors] = useState<Record<string, string>>({});
  const [boatColorsSectionOpen, setBoatColorsSectionOpen] = useState(false);
  const blockPanelRef = useRef<HTMLDivElement>(null);

  /** Resolve color for a boat: boat's color (from document) if set, else user override (localStorage), else default by index. */
  const getBoatColorResolved = useCallback(
    (boat: BoatItem, boatIndex: number) => {
      if (boat.color && /^#([0-9A-Fa-f]{3}){1,2}$/.test(boat.color)) return hexToRgb(boat.color);
      return boatColors[boat.id] ?? getBoatColor(boatIndex);
    },
    [boatColors]
  );

  /** Boat calendar color for a block, or null when the block applies to all boats. */
  const getBlockBoatColor = useCallback(
    (boatId: string | null | undefined): string | null => {
      if (!boatId) return null;
      const boatIdx = boatList.findIndex((b) => b.id === boatId);
      if (boatIdx < 0) return null;
      return getBoatColorResolved(boatList[boatIdx], boatIdx);
    },
    [boatList, getBoatColorResolved]
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
    // Every admin listing (new experiences may have no boats assigned yet).
    experienceNames.forEach((_title, docId) => docIds.add(docId));
    boatList.forEach((b) => {
      (b.experienceIds ?? []).forEach((slugOrId) => {
        const docId = experienceDocIdBySlugOrId.get(slugOrId) ?? slugOrId;
        docIds.add(docId);
      });
    });
    ticketedExperienceIds.forEach((id) => docIds.add(id));
    return Array.from(docIds).sort((a, b) =>
      (experienceNames.get(a) ?? a).localeCompare(experienceNames.get(b) ?? b),
    );
  }, [boatList, experienceDocIdBySlugOrId, ticketedExperienceIds, experienceNames]);

  const dateRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const visibleBlockRange = useMemo(() => {
    if (calendarView === "week") {
      const start = toDateStr(weekStart);
      const end = toDateStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6));
      return { start, end };
    }
    return dateRange;
  }, [calendarView, dateRange, weekStart]);

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
      const boatItems: BoatItem[] = boats.map((b: { id: string; name?: string; experienceIds?: string[]; color?: string }) => ({
        id: b.id,
        name: b.name ?? b.id,
        experienceIds: Array.isArray(b.experienceIds) ? b.experienceIds : [],
        color: typeof b.color === "string" && b.color.trim() ? b.color.trim() : undefined,
      }));
      setBoatList(boatItems);
      const boatNameMap = new Map<string, string>();
      boatItems.forEach((b) => boatNameMap.set(b.id, b.name));
      setBoatNames(boatNameMap);

      if (experiencesRes.ok) {
        const expList = await experiencesRes.json();
        const expNameMap = new Map<string, string>();
        const slugOrIdToDocId = new Map<string, string>();
        const ticketedIds = new Set<string>();
        (Array.isArray(expList) ? expList : []).forEach((e: { id: string; title?: string; slug?: string; pricingType?: string }) => {
          expNameMap.set(e.id, e.title ?? e.slug ?? e.id);
          slugOrIdToDocId.set(e.id, e.id);
          if (e.slug && e.slug.trim()) slugOrIdToDocId.set(e.slug.trim(), e.id);
          if (e.pricingType === "ticketed") ticketedIds.add(e.id);
        });
        setExperienceNames(expNameMap);
        setExperienceDocIdBySlugOrId(slugOrIdToDocId);
        setTicketedExperienceIds(ticketedIds);
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
      setSlotsError(null);
      return;
    }
    setSlotsError(null);
    setSlotsLoading(true);
    try {
      const all = await Promise.all(
        uniqueExperienceIds.map((experienceId) =>
          fetch(
            `/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${dateRange.start}&endDate=${dateRange.end}`,
            { credentials: "include" }
          ).then(async (res) => {
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(data.error ?? `Failed to load slots (${res.status})`);
            }
            return res.json();
          })
        )
      );
      const merged = all.flatMap((data) => (Array.isArray(data.slots) ? data.slots : []));
      setSlots(merged);
    } catch (e) {
      setSlots([]);
      setSlotsError(e instanceof Error ? e.message : "Could not load calendar slots. Try again.");
    } finally {
      setSlotsLoading(false);
    }
  }, [uniqueExperienceIds, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const [resultsTruncated, setResultsTruncated] = useState(false);

  type RawBooking = {
    id: string;
    slotId?: string | null;
    experienceId?: string | null;
    customer?: { name?: string; email?: string };
    boatName?: string | null;
    pricing?: { totalCents?: number };
    status?: string;
    startDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    durationHours?: number | null;
  };

  const bookingSummaryFromRaw = (b: RawBooking): BookingSummary => ({
    bookingId: b.id,
    customerName: b.customer?.name ?? "",
    customerEmail: b.customer?.email ?? "",
    boatName: b.boatName ?? null,
    totalCents: b.pricing?.totalCents ?? 0,
    status: b.status ?? "",
    slotId: b.slotId ?? null,
    startDate: b.startDate ?? null,
    startTime: b.startTime ?? null,
    endTime: b.endTime ?? null,
    durationHours: b.durationHours ?? null,
  });

  const fetchBookings = useCallback(async () => {
    setBookingsError(null);
    setBookingsLoading(true);
    setResultsTruncated(false);
    try {
      let list: RawBooking[] = [];
      let nextCursor: string | null = null;
      do {
        const params: Record<string, string> = {
          fromTripDate: dateRange.start,
          toTripDate: dateRange.end,
          limit: "500",
        };
        if (nextCursor) params.cursor = nextCursor;
        const res: Response = await fetch(`/api/admin/bookings?${new URLSearchParams(params)}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load bookings");
        const truncated = res.headers.get("X-Results-Truncated") === "true";
        if (truncated) setResultsTruncated(true);
        const data: { bookings?: RawBooking[]; nextCursor?: string } = await res.json();
        const page = (Array.isArray(data) ? data : Array.isArray(data?.bookings) ? data.bookings : []) as RawBooking[];
        list = nextCursor ? [...list, ...page] : page;
        nextCursor = data?.nextCursor ?? null;
      } while (nextCursor);

      const map = new Map<string, BookingSummary>();
      // Secondary map keyed by "experienceId:slotId" — avoids cross-experience false matches.
      // Only used to enrich ticketed slots whose bookingId is always null in the slot grid.
      const bySlotKey = new Map<string, BookingSummary>();
      const statuses = Array.from(BOOKING_STATUSES_SLOT_TAKEN) as string[];
      list
        .filter((b) => typeof b.status === "string" && statuses.includes(b.status))
        .forEach((b) => {
          const summary = bookingSummaryFromRaw(b);
          map.set(b.id, summary);
          // Index by experienceId:slotId so only the correct experience's ticketed slots match
          if (b.slotId && b.experienceId) bySlotKey.set(`${b.experienceId}:${b.slotId}`, summary);
        });
      setBookingsBySlotId(map);
      setBookingsBySlotKey(bySlotKey);
      // Synthesize SlotDto entries for bookings whose slotId has no corresponding slot in the
      // current `slots` array (ticketed experiences with multiple departure times per day).
      // Store them so enrichedSlots can merge them in.
      const syntheticRaw = list.filter((b) => typeof b.status === "string" && statuses.includes(b.status) && !!b.slotId);
      setSyntheticBookingSlots(
        syntheticRaw.flatMap((b) => {
          const sid = b.slotId!;
          const parsed = parseSlotId(sid) ?? (() => {
            const cleaned = sid.replace(/\s/g, "");
            const parts = cleaned.split("-");
            if (parts.length === 5) {
              const norm = `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}-${parts[3]}-${parts[4]}`;
              return parseSlotId(norm);
            }
            return null;
          })();
          if (!parsed) return [];
          try {
            const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
            return [{
              id: sid,
              dateStr: parsed.dateStr,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              status: "booked" as SlotStatus,
              holdId: null,
              bookingId: b.id,
              experienceId: b.experienceId ?? undefined,
              bookingSummary: b.experienceId
                ? (bySlotKey.get(`${b.experienceId}:${sid}`) ?? bookingSummaryFromRaw(b))
                : bookingSummaryFromRaw(b),
            } satisfies SlotDto];
          } catch { return []; }
        })
      );
    } catch (e) {
      setBookingsBySlotId(new Map());
      setBookingsBySlotKey(new Map());
      setSyntheticBookingSlots([]);
      setBookingsError(e instanceof Error ? e.message : "Could not load bookings. Try again.");
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
      setRescheduleDate("");
      setRescheduleHour("7");
      setRescheduleConfirmPricing(false);
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

  useEffect(() => {
    if (!bookingDetail?.slotId) return;
    const parsed = parseSlotId(bookingDetail.slotId);
    if (!parsed) return;
    setRescheduleDate(parsed.dateStr);
    setRescheduleHour(String(parsed.startHour));
  }, [bookingDetail?.slotId]);

  const enrichedSlots = useMemo(() => {
    // Composite key experienceId:slotId — slot ids alone are NOT globally unique across experiences
    // (a charter boat and the sunset cruise can both have "2026-02-23-19-4")
    const realSlotKeys = new Set(slots.map((s) => `${s.experienceId ?? ""}:${s.id}`));
    // Enrich real slots with booking summaries.
    // Fallback to experienceId:slotId keyed map ONLY for ticketed slots (bookingId=null in grid).
    // Restricting to ticketed prevents cross-experience false matches for charter slots.
    const enriched = slots.map((s) => ({
      ...s,
      bookingSummary:
        (s.bookingId ? (bookingsBySlotId.get(s.bookingId) ?? null) : null) ??
        (ticketedExperienceIds.has(s.experienceId ?? "") && s.experienceId
          ? (bookingsBySlotKey.get(`${s.experienceId}:${s.id}`) ?? null)
          : null),
    }));
    // Merge in synthetic booking slots for entries not already covered by the real grid
    const extras = syntheticBookingSlots.filter((s) => !realSlotKeys.has(`${s.experienceId ?? ""}:${s.id}`));
    const combined = [...enriched, ...extras];
    return combined;
  }, [slots, bookingsBySlotId, bookingsBySlotKey, syntheticBookingSlots, ticketedExperienceIds]);

  const filteredSlots = useMemo(() => {
    if (selectedBoatIds.size === 0) return enrichedSlots;
    // Always show ticketed slots (no boatId); only filter charter slots by boat
    return enrichedSlots.filter((s) => !s.boatId || selectedBoatIds.has(s.boatId));
  }, [enrichedSlots, selectedBoatIds]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, { open: number; held: number; booked: number; slots: SlotDto[] }>();
    for (const s of filteredSlots) {
      const day = getSlotCalendarDate(s);
      if (!map.has(day)) map.set(day, { open: 0, held: 0, booked: 0, slots: [] });
      const entry = map.get(day)!;
      entry.slots.push(s);
      if (s.status === "open") entry.open++;
      else if (s.status === "held") entry.held++;
      else if (s.status === "booked" && s.bookingSummary) entry.booked++;
      // "blocked" slots from the charter slot grid include booking-overlap entries;
      // we intentionally skip those here — admin block counts come from the blocks state.
    }
    map.forEach((entry) => entry.slots.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [filteredSlots]);

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  /**
   * Set of calendar days that have at least one admin-created block.
   * Uses a Set rather than a count because blocking a day creates one doc per boat,
   * so a count would show "3 blocked" for a single logically-blocked day.
   */
  const adminBlockedDays = useMemo(() => {
    const set = new Set<string>();
    for (const block of blocks) {
      const start = new Date(block.startAt);
      const end = new Date(block.endAt);
      const cur = new Date(start);
      cur.setHours(12, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(12, 0, 0, 0);
      while (cur <= endDay) {
        set.add(getDateStrInSlotTimezone(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return set;
  }, [blocks]);

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
      isBlocked: boolean;
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
        isBlocked: adminBlockedDays.has(dateStr),
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
  }, [calendarMonth, slotsByDate, todayStr, adminBlockedDays]);

  useEffect(() => {
    if (boatList.length === 1 && !rangeBoatId) setRangeBoatId(boatList[0].id);
  }, [boatList, rangeBoatId]);

  useEffect(() => {
    if (uniqueExperienceIds.length === 0) return;
    setRangeExperienceId((prev) =>
      prev && uniqueExperienceIds.includes(prev) ? prev : uniqueExperienceIds[0] ?? "",
    );
  }, [uniqueExperienceIds]);

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

  /** One slot per booking per day — prefer canonical booking slot row over overlap grid rows. */
  const uniqueBookedSlotsByDay = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    bookedSlotsByDay.forEach((slots, day) => {
      const byBookingId = new Map<string, SlotDto>();
      for (const s of slots) {
        const key = s.bookingId ?? s.bookingSummary?.bookingId ?? s.id;
        const prev = byBookingId.get(key);
        byBookingId.set(key, prev ? pickCanonicalBookingSlotRow(prev, s) : s);
      }
      const unique = Array.from(byBookingId.values()).sort((a, b) => a.startAt.localeCompare(b.startAt));
      map.set(day, unique);
    });
    return map;
  }, [bookedSlotsByDay]);

  /**
   * Real ticketed slots grouped by day — each entry has spotsBooked/maxCapacity from the slots API.
   * Used to show one capacity pill per departure on the calendar cell instead of per-customer cards.
   */
  const ticketedCapacityByDay = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    // Deduplicate by experienceId:slotId — the slots API may return one slot per boat
    // for ticketed experiences that have listing boats assigned.
    const seen = new Set<string>();
    for (const s of filteredSlots) {
      if (!ticketedExperienceIds.has(s.experienceId ?? "")) continue;
      if (typeof s.spotsBooked !== "number") continue; // only real ticketed slots (not synthetic)
      if ((s.spotsBooked ?? 0) === 0) continue; // only show when tickets have been purchased
      const dedupeKey = `${s.experienceId}:${s.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const day = getSlotCalendarDate(s);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    map.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [filteredSlots, ticketedExperienceIds]);

  const selectedDateSlots = selectedDate ? slotsByDate.get(selectedDate)?.slots ?? [] : [];

  const quickBlockBoatsForExperience = useMemo(() => {
    if (!quickBlockExperienceId) return [];
    return boatList.filter((b) =>
      (b.experienceIds ?? []).some((slugOrId) => {
        const docId = experienceDocIdBySlugOrId.get(slugOrId) ?? slugOrId;
        return docId === quickBlockExperienceId;
      })
    );
  }, [boatList, experienceDocIdBySlugOrId, quickBlockExperienceId]);

  /** Which length chip matches Start→End (Chicago-parsed), if any — within 1 minute of a whole hour. */
  const quickBlockSelectedLengthHours = useMemo(() => {
    const s = parseCentralDatetimeLocalInput(quickBlockStart);
    const e = parseCentralDatetimeLocalInput(quickBlockEnd);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    if (e.getTime() <= s.getTime()) return null;
    const hours = (e.getTime() - s.getTime()) / (60 * 60 * 1000);
    for (const h of QUICK_BLOCK_LENGTH_PRESET_HOURS) {
      if (Math.abs(hours - h) < 1 / 60) return h;
    }
    return null;
  }, [quickBlockStart, quickBlockEnd]);

  useEffect(() => {
    if (!dayDetailOpen || !selectedDate) return;
    setQuickBlockError(null);
    setQuickBlockNote("");
    const { start, end } = getSlotStartEnd(selectedDate, 9, 2, 0);
    setQuickBlockStart(formatDateAsCentralDatetimeLocal(start));
    setQuickBlockEnd(formatDateAsCentralDatetimeLocal(end));
  }, [dayDetailOpen, selectedDate]);

  useEffect(() => {
    if (!dayDetailOpen) return;
    setQuickBlockExperienceId((prev) => {
      if (uniqueExperienceIds.length === 1) return uniqueExperienceIds[0];
      if (prev && uniqueExperienceIds.includes(prev)) return prev;
      return uniqueExperienceIds[0] ?? "";
    });
  }, [dayDetailOpen, uniqueExperienceIds]);

  useEffect(() => {
    if (!dayDetailOpen || !quickBlockExperienceId) return;
    const boats = boatList.filter((b) =>
      (b.experienceIds ?? []).some((slugOrId) => {
        const docId = experienceDocIdBySlugOrId.get(slugOrId) ?? slugOrId;
        return docId === quickBlockExperienceId;
      })
    );
    setQuickBlockBoatId((prev) => (boats.some((b) => b.id === prev) ? prev : boats[0]?.id ?? ""));
  }, [dayDetailOpen, quickBlockExperienceId, boatList, experienceDocIdBySlugOrId]);

  const runBlockDate = async (dateStr: string) => {
    if (uniqueExperienceIds.length === 0) return;
    const key = `date-${dateStr}`;
    setBlocking(key);
    setError(null);
    setNotice(null);
    const boatIdsPayload = blockDayBoatIds.size > 0 ? Array.from(blockDayBoatIds) : undefined;
    try {
      const requests = uniqueExperienceIds.map(async (experienceId) => {
        const boatIds = boatIdsPayload != null
          ? boatList
              .filter((b) =>
                blockDayBoatIds.has(b.id) &&
                (b.experienceIds ?? []).some((slugOrId) => {
                  const docId = experienceDocIdBySlugOrId.get(slugOrId) ?? slugOrId;
                  return docId === experienceId;
                }),
              )
              .map((b) => b.id)
          : undefined;
        if (boatIdsPayload != null && boatIds?.length === 0) return { skipped: true, experienceId };
        const res = await fetch("/api/admin/blocks/block-date", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experienceId, date: dateStr, action: "block", boatIds: boatIds ?? undefined }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          blocksCreated?: number;
          boatOutcomes?: { boatId: string | null; outcome: string }[];
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to block date");
        const blocksCreated = typeof data.blocksCreated === "number" ? data.blocksCreated : 0;
        return { skipped: false, experienceId, blocksCreated, boatOutcomes: data.boatOutcomes };
      });
      const settled = await Promise.allSettled(requests);
      const succeeded: string[] = [];
      const failed: string[] = [];
      let totalBlocksCreated = 0;
      const skippedBoatSummaryLines: string[] = [];
      for (const item of settled) {
        if (item.status === "fulfilled") {
          if (item.value.skipped) continue;
          totalBlocksCreated += item.value.blocksCreated ?? 0;
          succeeded.push(experienceNames.get(item.value.experienceId) ?? item.value.experienceId);
          const outcomes = item.value.boatOutcomes;
          if (Array.isArray(outcomes) && outcomes.length > 0) {
            const skippedLabels = outcomes
              .filter((o) => o.outcome === "skipped_existing_full_day")
              .map((o) => {
                if (o.boatId == null) return "all boats";
                const name = boatList.find((b) => b.id === o.boatId)?.name;
                return name ?? `${o.boatId.slice(0, 8)}…`;
              });
            if (skippedLabels.length > 0) {
              const expLabel = experienceNames.get(item.value.experienceId) ?? item.value.experienceId;
              skippedBoatSummaryLines.push(`${expLabel}: ${skippedLabels.join(", ")}`);
            }
          }
        } else {
          failed.push(item.reason instanceof Error ? item.reason.message : "Failed");
        }
      }
      if (failed.length > 0) {
        const successMsg = succeeded.length > 0 ? `Succeeded: ${succeeded.join(", ")}.` : "No successful experience writes.";
        setError(`${successMsg} Failed: ${failed.join(" | ")}`);
        if (succeeded.length > 0) {
          bumpSlotCacheVersion();
          await fetchSlots();
        }
        await fetchBlocks();
        return;
      }
      const targetedExperienceLabels = succeeded;
      const expSummary = targetedExperienceLabels.length > 0 ? targetedExperienceLabels.join(", ") : "selected experiences";
      const skippedSuffix =
        skippedBoatSummaryLines.length > 0
          ? ` Some boats already had a full-day block (skipped): ${skippedBoatSummaryLines.join(" · ")}.`
          : "";
      if (totalBlocksCreated === 0) {
        setNotice({
          level: "warning",
          message: `No blocks were created for ${expSummary}. Check listing-boat assignment for this date.${skippedSuffix}`,
        });
      } else {
        setNotice({
          level: "success",
          message: `Blocked ${dateStr} for ${expSummary}.${skippedSuffix}`,
        });
      }
      bumpSlotCacheVersion();
      await fetchSlots();
      await fetchBlocks();
      setDayDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block date");
    } finally {
      setBlocking(null);
    }
  };

  const blockDate = (dateStr: string) => {
    setCalendarActionConfirm({
      title: "Block this date for all selected experiences?",
      description:
        "Customers will not be able to book on this calendar day for those experiences. This takes effect immediately.",
      confirmLabel: "Block date",
      run: () => runBlockDate(dateStr),
    });
  };

  const runUnblockDate = async (dateStr: string) => {
    if (uniqueExperienceIds.length === 0) return;
    const key = `date-${dateStr}`;
    setBlocking(key);
    setError(null);
    setNotice(null);
    try {
      const targetedExperienceLabels: string[] = [];
      let totalDeleted = 0;
      let totalSkipped = 0;
      for (const experienceId of uniqueExperienceIds) {
        const res = await fetch("/api/admin/blocks/block-date", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experienceId,
            date: dateStr,
            action: "unblock",
            includePartial: unblockIncludePartialRef.current,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          blocksDeleted?: number;
          timedOrPartialBlocksSkipped?: number;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to unblock date");
        targetedExperienceLabels.push(experienceNames.get(experienceId) ?? experienceId);
        totalDeleted += typeof data.blocksDeleted === "number" ? data.blocksDeleted : 0;
        totalSkipped += typeof data.timedOrPartialBlocksSkipped === "number" ? data.timedOrPartialBlocksSkipped : 0;
      }
      const expSummary = targetedExperienceLabels.length > 0 ? targetedExperienceLabels.join(", ") : "selected experiences";
      let message = `Unblocked ${dateStr} for ${expSummary}. Removed ${totalDeleted} block${totalDeleted === 1 ? "" : "s"}.`;
      if (totalSkipped > 0) {
        message += ` ${totalSkipped} time-range block${totalSkipped === 1 ? "" : "s"} on this date ${totalSkipped === 1 ? "was" : "were"} not removed — delete ${totalSkipped === 1 ? "it" : "them"} individually from the block list.`;
      }
      setNotice({
        level: "success",
        message,
      });
      bumpSlotCacheVersion();
      await fetchSlots();
      await fetchBlocks();
      setDayDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unblock date");
    } finally {
      setBlocking(null);
    }
  };

  const unblockDate = (dateStr: string) => {
    unblockIncludePartialRef.current = false;
    unblockDialogRenderKey.current += 1;
    setCalendarActionConfirm({
      title: "Unblock this date?",
      description:
        "By default, removes only full-day blocks that exactly match this calendar day (Chicago time). Optionally include timed or partial-day blocks that overlap this day.",
      confirmLabel: "Unblock date",
      children: (
        <div key={unblockDialogRenderKey.current} className="max-w-md">
          <label className="flex items-start gap-2 text-sm text-brand-dark cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 rounded border-brand-dark/30"
              defaultChecked={false}
              onChange={(e) => {
                unblockIncludePartialRef.current = e.target.checked;
              }}
            />
            <span>
              Also remove timed and partial-day blocks that overlap this day (including slot-specific blocks). Use with
              care — in-flight checkouts may fail.
            </span>
          </label>
        </div>
      ),
      run: () => runUnblockDate(dateStr),
    });
  };

  const runReleaseHold = async (holdId: string) => {
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

  /** Admin-only: releases checkout hold (admin session). Prefer this over calling the API directly from UI. */
  const releaseHold = (holdId: string) => {
    setCalendarActionConfirm({
      title: "Release this hold?",
      description:
        "This will release the customer’s hold and they may lose their checkout slot. The time may become available to others immediately.",
      confirmLabel: "Release hold",
      run: () => runReleaseHold(holdId),
    });
  };

  const openCancelCalendarBooking = (bookingId: string) => {
    setCancelCalPendingId(bookingId);
    setCancelCalRefund(true);
    setCancelCalOverride(false);
    setCancelCalNoRefundWarn(null);
    setCancelCalConfirmOpen(true);
  };

  const executeCancelCalendarBooking = async () => {
    if (!cancelCalPendingId) return;
    setCancelCalLoading(true);
    setCancelCalNoRefundWarn(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${cancelCalPendingId}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund: cancelCalRefund, overridePolicy: cancelCalOverride }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && (data as { code?: string }).code === "NO_REFUND_WINDOW_REQUIRES_CONFIRMATION") {
        setCancelCalNoRefundWarn(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Confirmation required."
        );
        return;
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to cancel booking");
      const refunds = Array.isArray((data as { refunds?: Array<{ error?: string }> }).refunds)
        ? (data as { refunds: Array<{ error?: string }> }).refunds
        : [];
      if (refunds.some((r) => r.error)) {
        setError(
          "Cancel completed but one or more Stripe refunds failed. Open Bookings to see which payment intents failed."
        );
      }
      setCancelCalConfirmOpen(false);
      setCancelCalPendingId(null);
      await fetchSlots();
      await fetchBookings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel booking");
    } finally {
      setCancelCalLoading(false);
    }
  };

  const executeRescheduleFromDetail = async () => {
    if (!bookingDetail?.id || !bookingDetail.slotId || !rescheduleDate) return;
    const parsedOld = parseSlotId(bookingDetail.slotId);
    const duration = parsedOld?.durationHours ?? bookingDetail.durationHours ?? 1;
    const slotId = buildSlotId(rescheduleDate, Number(rescheduleHour), duration);
    setRescheduleLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingDetail.id}/reschedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, confirmPricingChange: rescheduleConfirmPricing }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        if ((data as { code?: string }).code === "PRICING_CHANGE_REQUIRES_CONFIRMATION") {
          setRescheduleConfirmPricing(true);
          const oldTotal = typeof (data as { oldTotalCents?: number }).oldTotalCents === "number"
            ? (data as { oldTotalCents: number }).oldTotalCents
            : null;
          const newTotal = typeof (data as { newTotalCents?: number }).newTotalCents === "number"
            ? (data as { newTotalCents: number }).newTotalCents
            : null;
          setError(
            oldTotal != null && newTotal != null
              ? `Pricing changes from ${formatCents(oldTotal)} to ${formatCents(newTotal)}. Check "confirm pricing change" and retry.`
              : ((data as { error?: string }).error ?? "Reschedule requires confirmation.")
          );
          return;
        }
        setError((data as { error?: string }).error ?? "Slot conflict. Pick a different time.");
        return;
      }
      if (res.status === 400) {
        setError((data as { error?: string }).error ?? "Invalid time selection.");
        return;
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to reschedule booking");
      await fetchSlots();
      await fetchBookings();
      setBookingDetailOpen(false);
      setBookingDetailId(null);
      setRescheduleConfirmPricing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reschedule booking");
    } finally {
      setRescheduleLoading(false);
    }
  };

  const calendarGridPending = slotsLoading || bookingsLoading;

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
    if (uniqueExperienceIds.length === 0 || !rangeStart || !rangeEnd || !rangeExperienceId) return;
    if (rangeStart > rangeEnd) {
      setError("Start date must be before end date.");
      return;
    }
    const isTicketedRange = ticketedExperienceIds.has(rangeExperienceId);
    const ticketsHeldRaw = rangeTicketsHeld.trim();
    let ticketsBlocked: number | undefined;
    if (ticketsHeldRaw) {
      if (!isTicketedRange) {
        setError("Ticket holdbacks apply to ticketed trip types only. Leave blank to block the whole day.");
        return;
      }
      const n = Number.parseInt(ticketsHeldRaw, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError("Tickets to hold back must be a positive whole number.");
        return;
      }
      ticketsBlocked = n;
    }
    setRangeLoading(true);
    setError(null);
    setNotice(null);
    try {
      const boatIds = rangeBoatId ? [rangeBoatId] : undefined;
      const requests: Promise<{ experienceId: string; blocksCreated: number }>[] = [];
      const experienceIdsToBlock = [rangeExperienceId];
      for (let d = new Date(`${rangeStart}T12:00:00.000Z`); d <= new Date(`${rangeEnd}T12:00:00.000Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = getDateStrInSlotTimezone(d);
        if (dateStr < todayStr) continue;
        for (const experienceId of experienceIdsToBlock) {
          requests.push(
            fetch("/api/admin/blocks/block-date", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ experienceId, date: dateStr, action: "block", boatIds, ...(ticketsBlocked != null ? { ticketsBlocked } : {}) }),
            }).then(async (res) => {
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error ?? "Failed to block date");
              const blocksCreated = typeof (data as { blocksCreated?: unknown }).blocksCreated === "number"
                ? (data as { blocksCreated: number }).blocksCreated
                : 0;
              return { experienceId, blocksCreated };
            })
          );
        }
      }
      const settled = await Promise.allSettled(requests);
      let totalBlocksCreated = 0;
      const targetedExperienceLabels = new Set<string>();
      const failed: string[] = [];
      for (const item of settled) {
        if (item.status === "fulfilled") {
          totalBlocksCreated += item.value.blocksCreated;
          targetedExperienceLabels.add(experienceNames.get(item.value.experienceId) ?? item.value.experienceId);
        } else {
          failed.push(item.reason instanceof Error ? item.reason.message : "Failed");
        }
      }
      if (failed.length > 0) {
        const successMsg =
          targetedExperienceLabels.size > 0 ? `Succeeded: ${Array.from(targetedExperienceLabels).join(", ")}.` : "No successful experience writes.";
        setError(`${successMsg} Failed: ${failed.join(" | ")}`);
        if (targetedExperienceLabels.size > 0) {
          bumpSlotCacheVersion();
          await fetchSlots();
        }
        await fetchBlocks();
        return;
      }
      const expSummary = Array.from(targetedExperienceLabels).join(", ") || "selected experiences";
      if (totalBlocksCreated === 0) {
        setNotice({
          level: "warning",
          message: `No blocks were created for ${expSummary}. Check listing-boat assignment for the selected range.`,
        });
      } else {
        setNotice({
          level: "success",
          message: `Blocked ${rangeStart} to ${rangeEnd} for ${expSummary}.`,
        });
      }
      bumpSlotCacheVersion();
      await fetchSlots();
      await fetchBlocks();
      setAddBlockOpen(false);
      setRangeStart("");
      setRangeEnd("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block range");
    } finally {
      setRangeLoading(false);
    }
  };

  const fetchBlocks = useCallback(async () => {
    if (uniqueExperienceIds.length === 0) { setBlocks([]); return; }
    setBlocksLoading(true);
    try {
      const seen = new Set<string>();
      const all: {
        id: string;
        boatId: string | null;
        startAt: string;
        endAt: string;
        note: string | null;
        slotId?: string | null;
      }[] = [];
      for (const expId of uniqueExperienceIds) {
        const res = await fetch(
          `/api/admin/blocks?experienceId=${encodeURIComponent(expId)}&from=${visibleBlockRange.start}&to=${visibleBlockRange.end}`,
          { credentials: "include" }
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(
            (b: {
              id: string;
              boatId: string | null;
              startAt: string;
              endAt: string;
              note: string | null;
              slotId?: string | null;
              ticketsBlocked?: number | null;
            }) => {
              if (!seen.has(b.id)) {
                seen.add(b.id);
                all.push({
                  ...b,
                  slotId: b.slotId ?? null,
                });
              }
            }
          );
        }
      }
      all.sort((a, b) => a.startAt.localeCompare(b.startAt));
      setBlocks(all);
    } catch { setBlocks([]); }
    finally { setBlocksLoading(false); }
  }, [uniqueExperienceIds, visibleBlockRange.end, visibleBlockRange.start]);

  const runQuickBlockForDay = useCallback(async () => {
    setQuickBlockError(null);
    if (!quickBlockExperienceId) {
      setQuickBlockError("Select an experience (use the filters above if this list is empty).");
      return;
    }
    const isTicketedQuickBlock = ticketedExperienceIds.has(quickBlockExperienceId);
    const ticketsHeldRaw = quickBlockTicketsHeld.trim();
    let ticketsBlocked: number | undefined;
    if (ticketsHeldRaw) {
      if (!isTicketedQuickBlock) {
        setQuickBlockError("Ticket holdbacks apply to ticketed trip types only. Leave blank to block the whole time.");
        return;
      }
      const n = Number.parseInt(ticketsHeldRaw, 10);
      if (!Number.isFinite(n) || n < 1) {
        setQuickBlockError("Tickets to hold back must be a positive whole number.");
        return;
      }
      ticketsBlocked = n;
    }
    const start = parseCentralDatetimeLocalInput(quickBlockStart);
    const end = parseCentralDatetimeLocalInput(quickBlockEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setQuickBlockError("Enter valid start and end times.");
      return;
    }
    if (start >= end) {
      setQuickBlockError("End must be after start.");
      return;
    }
    if (end.getTime() <= Date.now()) {
      setQuickBlockError("That time range is already over. Pick a future window.");
      return;
    }
    setQuickBlockSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: quickBlockExperienceId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          boatId: quickBlockBoatId.trim() || undefined,
          note: quickBlockNote.trim() || undefined,
          ...(ticketsBlocked != null ? { ticketsBlocked } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create block");
      setNotice({
        level: "success",
        message: ticketsBlocked != null
          ? `Held back ${ticketsBlocked} ticket${ticketsBlocked === 1 ? "" : "s"} for that departure — remaining tickets stay on sale.`
          : "Blocked that time for the selected boat (or whole experience if no boat).",
      });
      bumpSlotCacheVersion();
      await fetchSlots();
      await fetchBlocks();
    } catch (e) {
      setQuickBlockError(e instanceof Error ? e.message : "Failed to create block");
    } finally {
      setQuickBlockSaving(false);
    }
  }, [
    quickBlockExperienceId,
    quickBlockStart,
    quickBlockEnd,
    quickBlockBoatId,
    quickBlockNote,
    quickBlockTicketsHeld,
    ticketedExperienceIds,
    fetchSlots,
    fetchBlocks,
  ]);

  const applyQuickBlockDurationHours = useCallback(
    (hours: number) => {
      let start = parseCentralDatetimeLocalInput(quickBlockStart);
      if (Number.isNaN(start.getTime()) && dayDetailOpen && selectedDate) {
        const seeded = getSlotStartEnd(selectedDate, 9, 2, 0).start;
        const startStr = formatDateAsCentralDatetimeLocal(seeded);
        if (startStr) setQuickBlockStart(startStr);
        start = seeded;
      }
      if (Number.isNaN(start.getTime())) return;
      const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
      const endStr = formatDateAsCentralDatetimeLocal(end);
      if (endStr) setQuickBlockEnd(endStr);
    },
    [quickBlockStart, dayDetailOpen, selectedDate]
  );

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const deleteBlock = async (id: string) => {
    setDeletingBlockId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/blocks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Failed to delete block");
        await fetchBlocks();
        return;
      }
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      bumpSlotCacheVersion();
      await fetchSlots();
      await fetchBlocks();
    } catch {
      setError("Failed to delete block");
      await fetchBlocks();
    }
    finally { setDeletingBlockId(null); }
  };

  const deleteAllBlocks = async () => {
    if (blocks.length === 0) return;
    if (!confirm(`Remove all ${blocks.length} block${blocks.length !== 1 ? "s" : ""}? This will unblock every blocked date.`)) return;
    setDeletingAll(true);
    setError(null);
    try {
      const results = await Promise.all(
        blocks.map((b) => fetch(`/api/admin/blocks/${b.id}`, { method: "DELETE", credentials: "include" }))
      );
      const failures: string[] = [];
      for (const res of results) {
        if (res.ok || res.status === 404) continue;
        const data = await res.json().catch(() => ({}));
        failures.push((data as { error?: string }).error ?? `Delete failed (${res.status})`);
      }
      if (failures.length > 0) {
        setError(`Some blocks failed to delete: ${failures.join(" | ")}`);
        await fetchBlocks();
        return;
      }
      setBlocks([]);
      bumpSlotCacheVersion();
      await fetchSlots();
      await fetchBlocks();
    } catch {
      setError("Failed to delete all blocks");
      await fetchBlocks();
    }
    finally { setDeletingAll(false); }
  };

  /** Pre-fill date range inputs and open the form — for quick-action buttons */
  const openBlockForm = (start: string, end: string) => {
    setRangeStart(start);
    setRangeEnd(end);
    setAddBlockOpen(true);
  };

  const quickBlockToday = () => openBlockForm(toDateStr(new Date()), toDateStr(new Date()));

  const quickBlockWeekend = () => {
    const now = new Date();
    const day = now.getDay();
    const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7 || 7;
    const sat = new Date(now); sat.setDate(now.getDate() + daysToSat);
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    openBlockForm(toDateStr(sat), toDateStr(sun));
  };

  const quickBlockThisWeek = () => {
    const now = new Date();
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    openBlockForm(toDateStr(mon), toDateStr(sun));
  };

  const formatCents = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);

  const fmtBlockDate = (startAt: string, endAt: string, slotId?: string | null): string => {
    const timeRange = `${formatBookingTimeFromIso(startAt)}–${formatBookingTimeFromIso(endAt)}`;
    const sDay = getDateStrInSlotTimezone(new Date(startAt));
    const eDay = getDateStrInSlotTimezone(new Date(endAt));
    const fmtDay = (d: string) => formatBookingDate(getSlotStartEnd(d, 0, 0, 0).start);
    if (sDay === eDay) {
      const dayLabel = fmtDay(sDay);
      if (!slotId && isSingleCentralFullDayBlock(startAt, endAt)) {
        return `${dayLabel} · All day`;
      }
      return `${dayLabel} · ${timeRange}`;
    }
    return `${fmtDay(sDay)} – ${fmtDay(eDay)} · ${timeRange}`;
  };

  const weekViewExperienceIds = useMemo(() => {
    if (selectedBoatIds.size === 0) return uniqueExperienceIds;
    const set = new Set<string>();
    for (const boat of boatList) {
      if (!selectedBoatIds.has(boat.id)) continue;
      for (const rawId of boat.experienceIds ?? []) {
        set.add(experienceDocIdBySlugOrId.get(rawId) ?? rawId);
      }
    }
    return Array.from(set);
  }, [selectedBoatIds, uniqueExperienceIds, boatList, experienceDocIdBySlugOrId]);
  const weekViewBlockExperienceId = weekViewExperienceIds.length === 1 ? weekViewExperienceIds[0] : undefined;
  const experienceNamesById = useMemo(
    () => Object.fromEntries(Array.from(experienceNames.entries())),
    [experienceNames]
  );

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
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
      {notice && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            notice.level === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          )}
          role="status"
        >
          {notice.message}
        </div>
      )}

      {slotsError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2"
          role="alert"
        >
          <span>{slotsError}</span>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void fetchSlots()}>
            Retry
          </Button>
        </div>
      )}

      {bookingsError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2"
          role="alert"
        >
          <span>{bookingsError}</span>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void fetchBookings()}>
            Retry
          </Button>
        </div>
      )}

      {resultsTruncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          More than 500 bookings match this date range. The calendar may be incomplete. Narrow the range or use the Bookings page with pagination to see all results.
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-brand-dark/10 bg-white p-8 text-center text-brand-muted">
          Loading…
        </div>
      )}
      {!loading && boatList.length === 0 && ticketedExperienceIds.size === 0 && (
        <div className="rounded-xl border border-brand-dark/10 bg-white p-8 text-center text-brand-muted">
          <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-brand-muted/50" />
          <p className="font-medium text-brand-dark">Add boats or experiences to see the calendar</p>
          <p className="text-sm text-brand-muted mt-1 max-w-sm mx-auto">
            Create and assign boats in <strong>Boats</strong>. Bookings from your site will appear here by boat, date, and time.
          </p>
        </div>
      )}
      {!loading && (boatList.length > 0 || ticketedExperienceIds.size > 0) && (
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
                  // Always jump to the current week when switching to week view
                  const d = new Date();
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
                    Calendar uses each boat&apos;s color when set (edit boat to set). Override below; saved in this browser.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boatList.map((boat, idx) => {
                      const currentRgb = getBoatColorResolved(boat, idx);
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
                  const color = getBoatColorResolved(boat, idx);
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
            calendarGridPending ? (
              <div className="grid min-h-[320px] place-items-center rounded-2xl border border-brand-dark/10 bg-white/80 text-brand-muted text-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                  Loading slots and bookings…
                </div>
              </div>
            ) : (
            <AdminCalendarWeekView
              experienceId={weekViewBlockExperienceId}
              experienceIds={weekViewExperienceIds}
              experienceNamesById={experienceNamesById}
              ticketedExperienceIds={Array.from(ticketedExperienceIds)}
              boatList={boatList.map((b) => ({ id: b.id, name: b.name }))}
              weekStart={weekStart}
              selectedBoatIds={selectedBoatIds.size === 0 ? undefined : Array.from(selectedBoatIds)}
              boatColorByIndex={boatList.reduce<Record<number, string>>((acc, _, i) => ({ ...acc, [i]: getBoatColorResolved(boatList[i], i) }), {})}
              onPrevWeek={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })}
              onNextWeek={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })}
              onGoToToday={() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); setWeekStart(d); }}
              onBookingClick={(bookingId) => { setBookingDetailId(bookingId); setBookingDetailOpen(true); }}
              onRefresh={() => {
                bumpSlotCacheVersion();
                void fetchSlots();
                void fetchBookings();
              }}
            />
            )
          ) : (
          <>
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
              {/* Legend — each item matches what actually appears on calendar cells */}
              <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {/* Available: clean white cell = no bookings yet */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-muted">
                    <span className="h-3 w-3 rounded-sm border border-brand-dark/25 bg-white shrink-0" aria-hidden />
                    Available
                  </span>
                  {/* Booked: left-border card — same style as booking pills on the grid */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-muted">
                    <span
                      className="h-3 w-4 rounded-sm border-l-[3px] shrink-0"
                      style={{ borderLeftColor: STATUS_COLORS.booked.bg, backgroundColor: `${STATUS_COLORS.booked.bg}18` }}
                      aria-hidden
                    />
                    Charter Booked
                  </span>
                  {/* Ticketed: violet dot + pill = ticketed experience with capacity */}
                  {ticketedExperienceIds.size > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700">
                      <span className="h-3 w-4 rounded-sm border-l-[3px] border-violet-500 bg-violet-500/10 shrink-0" aria-hidden />
                      Tickets (N/cap)
                    </span>
                  )}
                  {/* Held: amber dot — appears on cells with a slot held at checkout */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-amber-400" aria-hidden />
                    Held
                  </span>
                  {/* Blocked: gray dot — appears on cells that have blocked time slots */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-slate-400" aria-hidden />
                    Blocked
                  </span>
                  {/* Boat color swatches */}
                  {boatList.length > 1 && (
                    <>
                      <span className="w-px h-4 bg-brand-dark/20 shrink-0 mx-1" aria-hidden />
                      {boatList.map((boat, idx) => {
                        const c = getBoatColorResolved(boat, idx);
                        return (
                          <span
                            key={boat.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium"
                            style={{ color: c }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c }} aria-hidden />
                            {boat.name}
                          </span>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              {calendarGridPending ? (
                <div className="grid min-h-[380px] place-items-center rounded-2xl border border-brand-dark/10 bg-white/80 text-brand-muted text-sm">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                    Loading slots and bookings…
                  </div>
                </div>
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
                    const bookedForDay = (uniqueBookedSlotsByDay.get(cell.dateStr) ?? []).filter(
                      (s) => !ticketedExperienceIds.has(s.experienceId ?? "")
                    );
                    const ticketedForDay = ticketedCapacityByDay.get(cell.dateStr) ?? [];
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
                          "min-h-[60px] sm:min-h-[140px] md:min-h-[160px] flex flex-col rounded-xl border p-2 text-left transition-all overflow-hidden relative",
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
                        {/* Desktop: booking pills sorted by start time + held/blocked indicators */}
                        {(() => {
                          // Merge ticketed capacity slots and charter booking slots, sorted by start time
                          type CellItem = { kind: "ticketed"; slot: SlotDto } | { kind: "charter"; slot: SlotDto };
                          const allItems: CellItem[] = [
                            ...ticketedForDay.map((slot): CellItem => ({ kind: "ticketed", slot })),
                            ...bookedForDay.map((slot): CellItem => ({ kind: "charter", slot })),
                          ].sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt));
                          const totalCount = allItems.length;
                          const visible = allItems.slice(0, 3);
                          return (
                            <div className="hidden sm:flex flex-col gap-1 flex-1 min-h-0">
                              {visible.map((item, idx) => {
                                if (item.kind === "ticketed") {
                                  const slot = item.slot;
                                  const booked = slot.spotsBooked ?? 0;
                                  const cap = slot.maxCapacity ?? 0;
                                  const pct = cap > 0 ? booked / cap : 0;
                                  const isFull = cap > 0 && slot.spotsRemaining === 0;
                                  const pillColor = isFull ? "#e11d48" : pct >= 0.75 ? "#d97706" : "#7c3aed";
                                  return (
                                    <button
                                      key={`tick-${slot.id}`}
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openDayDetail(cell.dateStr); }}
                                      className="w-full text-left rounded-lg border-l-4 px-2 py-1.5 text-[10px] leading-tight shrink-0 font-medium shadow-sm hover:opacity-90 transition-opacity"
                                      style={{ borderLeftColor: pillColor, backgroundColor: `${pillColor}12`, color: "rgb(15 23 42)" }}
                                      title="View ticket bookings"
                                    >
                                      <span className="font-bold tabular-nums" style={{ color: pillColor }}>{formatSlotTime(slot)}</span>
                                      <span className="block truncate" style={{ color: pillColor }}>
                                        {experienceNames.get(slot.experienceId!) ?? "Tickets"} · {booked}/{cap} guests{isFull && " · FULL"}
                                      </span>
                                    </button>
                                  );
                                }
                                const slot = item.slot;
                                const boatIdx = slot.boatId ? boatList.findIndex((b) => b.id === slot.boatId) : -1;
                                const boatColor = boatIdx >= 0 ? getBoatColorResolved(boatList[boatIdx], boatIdx) : STATUS_COLORS.booked.bg;
                                const bookingId = slot.bookingSummary?.bookingId ?? slot.bookingId;
                                return (
                                  <button
                                    key={`${slot.id}-${slot.boatId ?? "n"}-${idx}`}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); if (bookingId) { setBookingDetailId(bookingId); setBookingDetailOpen(true); } }}
                                    className="w-full text-left rounded-lg border-l-4 px-2 py-1.5 text-[10px] leading-tight shrink-0 font-medium shadow-sm hover:opacity-90 transition-opacity"
                                    style={{ borderLeftColor: boatColor, backgroundColor: `${boatColor}15`, color: "rgb(15 23 42)" }}
                                    title={bookingId ? "View booking details" : undefined}
                                  >
                                    <span className="font-bold tabular-nums" style={{ color: boatColor }}>{formatBookingCardTime(slot)}{getBookingCardDurationLabel(slot) ? ` · ${getBookingCardDurationLabel(slot)}` : ""}</span>
                                    {(slot.bookingSummary?.boatName ?? boatList.find((b) => b.id === slot.boatId)?.name) && (
                                      <span className="block truncate opacity-90 text-brand-dark">{slot.bookingSummary?.boatName ?? boatList.find((b) => b.id === slot.boatId)?.name}</span>
                                    )}
                                    {slot.bookingSummary?.customerName && (
                                      <span className="block truncate opacity-80 text-brand-muted">{slot.bookingSummary.customerName}</span>
                                    )}
                                  </button>
                                );
                              })}
                              {totalCount > 3 && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); openDayDetail(cell.dateStr); }} className="text-[10px] font-semibold text-left w-full" style={{ color: STATUS_COLORS.booked.bg }}>
                                  +{totalCount - 3} more — view day
                                </button>
                              )}
                              {/* Held + Blocked indicators */}
                              {!isPast && (cell.heldCount > 0 || cell.isBlocked) && (
                                <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                                  {cell.heldCount > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
                                      {cell.heldCount} held
                                    </span>
                                  )}
                                  {cell.isBlocked && (() => {
                                    const dayBlocks = blocks.filter(
                                      (b) => blockSegmentOnCentralDay(b.startAt, b.endAt, cell.dateStr) != null
                                    );
                                    // One pill per boat (or "all boats") so blocked days match boat colors.
                                    const byBoatKey = new Map<string, typeof dayBlocks>();
                                    for (const b of dayBlocks) {
                                      const key = b.boatId?.trim() || "__all__";
                                      const list = byBoatKey.get(key);
                                      if (list) list.push(b);
                                      else byBoatKey.set(key, [b]);
                                    }
                                    const entries = Array.from(byBoatKey.entries());
                                    return entries.map(([boatKey, boatBlocks]) => {
                                      const boatId = boatKey === "__all__" ? null : boatKey;
                                      const boatColor = getBlockBoatColor(boatId);
                                      const boatName = boatId
                                        ? (boatNames.get(boatId) ?? boatList.find((b) => b.id === boatId)?.name ?? "Boat")
                                        : null;
                                      const partialSummaries = boatBlocks
                                        .filter((b) => isNonFullDayBlockOnDate(b, cell.dateStr))
                                        .map((b) => {
                                          const seg = blockSegmentOnCentralDay(b.startAt, b.endAt, cell.dateStr)!;
                                          return `${formatBookingTimeFromIso(seg.clipStart.toISOString())}–${formatBookingTimeFromIso(seg.clipEnd.toISOString())}`;
                                        });
                                      const timePart =
                                        partialSummaries.length > 0
                                          ? partialSummaries.slice(0, 2).join(", ") +
                                            (partialSummaries.length > 2 ? ` +${partialSummaries.length - 2}` : "")
                                          : "All day";
                                      const pillLabel = boatName
                                        ? `Blocked · ${boatName} · ${timePart}`
                                        : `Blocked · All boats · ${timePart}`;
                                      return (
                                        <span
                                          key={`block-${cell.dateStr}-${boatKey}`}
                                          className={cn(
                                            "inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full max-w-full border",
                                            !boatColor && "text-slate-500 bg-slate-100 border-slate-200"
                                          )}
                                          style={
                                            boatColor
                                              ? {
                                                  color: "rgb(15 23 42)",
                                                  backgroundColor: rgbWithAlpha(boatColor, 0.12),
                                                  borderColor: rgbWithAlpha(boatColor, 0.45),
                                                }
                                              : undefined
                                          }
                                          title={pillLabel}
                                        >
                                          <span
                                            className={cn("h-1.5 w-1.5 rounded-full shrink-0", !boatColor && "bg-slate-400")}
                                            style={boatColor ? { backgroundColor: boatColor } : undefined}
                                            aria-hidden
                                          />
                                          <span className="truncate">{pillLabel}</span>
                                        </span>
                                      );
                                    });
                                  })()}
                                </div>
                              )}
                              {daySlots.length === 0 && !isPast && <span className="text-[10px] italic text-brand-muted mt-auto">No slots</span>}
                            </div>
                          );
                        })()}
                        {/* Mobile: colored dots sorted by start time */}
                        <div className="sm:hidden flex flex-wrap gap-1 mt-1">
                          {[
                            ...ticketedForDay.map((slot) => ({ isTicketed: true, slot })),
                            ...bookedForDay.map((slot) => ({ isTicketed: false, slot })),
                          ].sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt)).slice(0, 4).map(({ isTicketed, slot }, idx) => {
                            if (isTicketed) return <span key={`t-${idx}`} className="h-2 w-2 rounded-full shrink-0 bg-violet-500" aria-label="Tickets" />;
                            const boatIdx = slot.boatId ? boatList.findIndex((b) => b.id === slot.boatId) : -1;
                            const color = boatIdx >= 0 ? getBoatColorResolved(boatList[boatIdx], boatIdx) : STATUS_COLORS.booked.bg;
                            return <span key={idx} className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />;
                          })}
                          {bookedForDay.length + ticketedForDay.length > 4 && <span className="text-[9px] text-brand-muted">+{bookedForDay.length + ticketedForDay.length - 4}</span>}
                          {!isPast && cell.heldCount > 0 && <span className="h-2 w-2 rounded-full shrink-0 bg-amber-400" aria-label="Held" />}
                          {!isPast && cell.isBlocked && (() => {
                            const dayBlocks = blocks.filter(
                              (b) => blockSegmentOnCentralDay(b.startAt, b.endAt, cell.dateStr) != null
                            );
                            const boatKeys = Array.from(
                              new Set(dayBlocks.map((b) => b.boatId?.trim() || "__all__"))
                            );
                            return boatKeys.slice(0, 3).map((boatKey) => {
                              const boatId = boatKey === "__all__" ? null : boatKey;
                              const boatColor = getBlockBoatColor(boatId);
                              return (
                                <span
                                  key={`m-block-${boatKey}`}
                                  className={cn("h-2 w-2 rounded-full shrink-0", !boatColor && "bg-slate-400")}
                                  style={boatColor ? { backgroundColor: boatColor } : undefined}
                                  aria-label={boatId ? `Blocked · ${boatNames.get(boatId) ?? "boat"}` : "Blocked · all boats"}
                                />
                              );
                            });
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          </div>

          {/* Blocked dates panel */}
          <div ref={blockPanelRef} className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setBlocksListOpen((o) => !o)}
                className="flex items-center gap-2 min-w-0 text-left rounded-lg -ml-1 px-1 py-0.5 hover:bg-brand-bg/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                aria-expanded={blocksListOpen}
                aria-controls="blocked-dates-list"
              >
                {blocksListOpen ? (
                  <ChevronUp className="h-4 w-4 text-brand-muted shrink-0" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 text-brand-muted shrink-0" aria-hidden />
                )}
                <Ban className="h-4 w-4 text-red-400 shrink-0" aria-hidden />
                <span className="text-sm font-semibold text-brand-dark">Blocked dates</span>
                {blocks.length > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 leading-none tabular-nums">
                    {blocks.length}
                  </span>
                )}
                {!blocksListOpen && blocks.length > 0 && (
                  <span className="hidden sm:inline text-xs text-brand-muted font-normal truncate">
                    · Click to view
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {blocks.length > 0 && (
                  <button
                    type="button"
                    onClick={deleteAllBlocks}
                    disabled={deletingAll}
                    className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 transition-colors"
                  >
                    {deletingAll ? "Removing…" : "Unblock all"}
                  </button>
                )}
                <Button
                  variant={addBlockOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setAddBlockOpen((o) => {
                      const next = !o;
                      if (next) setBlocksListOpen(true);
                      return next;
                    });
                  }}
                  className="gap-1.5 text-xs shrink-0"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {addBlockOpen ? "Close" : "Block dates"}
                </Button>
              </div>
            </div>

            {/* ── Quick-add form ── */}
            {addBlockOpen && (
              <div className="border-t border-brand-dark/10 bg-brand-bg/30 px-4 py-4 sm:px-6 space-y-4">

                {/* Quick shortcuts */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted mb-2">Quick block</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Today", action: quickBlockToday },
                      { label: "This weekend", action: quickBlockWeekend },
                      { label: "This week", action: quickBlockThisWeek },
                    ].map(({ label, action }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={action}
                        className="rounded-full border border-brand-dark/20 bg-white px-3 py-1.5 text-xs font-medium text-brand-dark hover:border-brand-primary/60 hover:bg-brand-primary/5 hover:text-brand-primary transition-colors shadow-sm"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date range + boat + submit */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted mb-2">Custom range</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1 min-w-[200px]">
                      <label htmlFor="block-range-experience" className="text-xs text-brand-muted">Trip type</label>
                      <select
                        id="block-range-experience"
                        value={rangeExperienceId}
                        onChange={(e) => setRangeExperienceId(e.target.value)}
                        className="rounded-lg border border-brand-dark/20 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none min-h-[36px]"
                      >
                        {uniqueExperienceIds.map((id) => (
                          <option key={id} value={id}>
                            {experienceNames.get(id) ?? id}
                          </option>
                        ))}
                      </select>
                    </div>
                    {ticketedExperienceIds.has(rangeExperienceId) && (
                      <div className="flex flex-col gap-1 min-w-[160px]">
                        <label htmlFor="block-range-tickets" className="text-xs text-brand-muted">Tickets to hold back</label>
                        <input
                          id="block-range-tickets"
                          type="number"
                          min={1}
                          step={1}
                          placeholder="Optional"
                          value={rangeTicketsHeld}
                          onChange={(e) => setRangeTicketsHeld(e.target.value)}
                          className="rounded-lg border border-brand-dark/20 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none min-h-[36px]"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="block-range-from" className="text-xs text-brand-muted">From</label>
                      <input
                        id="block-range-from"
                        type="date"
                        value={rangeStart}
                        aria-label="Block start date"
                        onChange={(e) => {
                          setRangeStart(e.target.value);
                          if (!rangeEnd || e.target.value > rangeEnd) setRangeEnd(e.target.value);
                        }}
                        className="rounded-lg border border-brand-dark/20 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none min-h-[36px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="block-range-to" className="text-xs text-brand-muted">To</label>
                      <input
                        id="block-range-to"
                        type="date"
                        value={rangeEnd}
                        min={rangeStart}
                        aria-label="Block end date"
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="rounded-lg border border-brand-dark/20 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none min-h-[36px]"
                      />
                    </div>
                    {boatList.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <label htmlFor="block-boat-select" className="text-xs text-brand-muted">Boat</label>
                        <select
                          id="block-boat-select"
                          value={rangeBoatId}
                          onChange={(e) => setRangeBoatId(e.target.value)}
                          className="rounded-lg border border-brand-dark/20 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none min-h-[36px]"
                        >
                          <option value="">All boats</option>
                          {boatList
                            .filter((b) =>
                              (b.experienceIds ?? []).some((slugOrId) => {
                                const docId = experienceDocIdBySlugOrId.get(slugOrId) ?? slugOrId;
                                return docId === rangeExperienceId;
                              }),
                            )
                            .map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={blockRange}
                      disabled={rangeLoading || !rangeStart || !rangeEnd || !rangeExperienceId}
                      className="gap-1.5 min-h-[36px]"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {rangeLoading ? "Blocking…" : "Block"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setAddBlockOpen(false); setRangeStart(""); setRangeEnd(""); }}
                      className="min-h-[36px] text-brand-muted"
                    >
                      Cancel
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-brand-muted">
                    Pick the trip type customers book on the site. Blocking a specific boat applies on every trip type for that boat.
                  </p>
                  {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                </div>
              </div>
            )}

            {/* ── Blocks list as chips (collapsible + scroll-capped) ── */}
            {blocksListOpen && (
            <div id="blocked-dates-list" className="border-t border-brand-dark/10 px-4 py-4 sm:px-6">
              {blocksLoading ? (
                <div className="flex items-center gap-2 text-sm text-brand-muted">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : blocks.length === 0 ? (
                <p className="text-sm text-brand-muted">
                  No upcoming blocks. Use <strong>Block dates</strong> above to block time off.
                </p>
              ) : (
                <div className="max-h-40 sm:max-h-48 overflow-y-auto overscroll-contain pr-1">
                  <div className="flex flex-wrap gap-2">
                  {blocks.map((block) => {
                    const boatLabel = block.boatId
                      ? (boatNames.get(block.boatId) ?? block.boatId)
                      : null;
                    const boatColor = getBlockBoatColor(block.boatId);
                    const isDeleting = deletingBlockId === block.id;
                    const blockTitle = block.note?.trim() || "Blocked";
                    const sDay = getDateStrInSlotTimezone(new Date(block.startAt));
                    const eDay = getDateStrInSlotTimezone(new Date(block.endAt));
                    const showPartialBadge =
                      (block.slotId ?? null) !== null ||
                      sDay !== eDay ||
                      !isSingleCentralFullDayBlock(block.startAt, block.endAt);
                    return (
                      <div
                        key={block.id}
                        className={cn(
                          "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                          isDeleting && "opacity-60",
                          !boatColor && !isDeleting && "border-red-200 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100",
                          !boatColor && isDeleting && "border-brand-dark/10 bg-brand-bg/50 text-brand-muted"
                        )}
                        style={
                          boatColor && !isDeleting
                            ? {
                                borderColor: boatColor,
                                backgroundColor: rgbWithAlpha(boatColor, 0.12),
                                color: "rgb(15 23 42)",
                              }
                            : boatColor && isDeleting
                              ? {
                                  borderColor: rgbWithAlpha(boatColor, 0.35),
                                  backgroundColor: rgbWithAlpha(boatColor, 0.06),
                                  color: "rgb(15 23 42)",
                                }
                              : undefined
                        }
                      >
                        <Ban className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                        <span>{blockTitle}</span>
                        {typeof block.ticketsBlocked === "number" && block.ticketsBlocked > 0 ? (
                          <span className="rounded bg-violet-100 text-violet-900 border border-violet-200 px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
                            {block.ticketsBlocked} ticket{block.ticketsBlocked === 1 ? "" : "s"} held
                          </span>
                        ) : null}
                        {showPartialBadge ? (
                          <span className="rounded bg-amber-100 text-amber-950 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                            Partial
                          </span>
                        ) : null}
                        <span className="opacity-70">· {fmtBlockDate(block.startAt, block.endAt, block.slotId)}</span>
                        {boatLabel && (
                          <span className="opacity-70">· {boatLabel}</span>
                        )}
                        {!boatLabel && (
                          <span className="opacity-70">· All boats</span>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteBlock(block.id)}
                          disabled={isDeleting}
                          aria-label={`Unblock ${blockTitle} (${fmtBlockDate(block.startAt, block.endAt, block.slotId)})`}
                          className={cn(
                            "ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:text-white transition-all disabled:opacity-40",
                            boatColor ? "text-inherit hover:opacity-90" : "bg-red-200 text-red-700 hover:bg-red-400"
                          )}
                          style={
                            boatColor
                              ? { backgroundColor: rgbWithAlpha(boatColor, 0.25) }
                              : undefined
                          }
                        >
                          {isDeleting ? (
                            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <span className="text-[10px] font-bold leading-none">✕</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Day detail modal: timeline of time slots + bookings + actions */}
          <Dialog
        open={dayDetailOpen}
        onOpenChange={setDayDetailOpen}
        fullScreenOnMobile
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
                  const charterBookings = dayBookings.filter((s) => !ticketedExperienceIds.has(s.experienceId ?? ""));
                  const ticketedBookings = dayBookings.filter((s) => ticketedExperienceIds.has(s.experienceId ?? ""));
                  const capacitySlots = ticketedCapacityByDay.get(selectedDate) ?? [];
                  const hasAnything = charterBookings.length > 0 || ticketedBookings.length > 0 || capacitySlots.length > 0;
                  if (!hasAnything) {
                    return (
                      <p className="py-4 text-center text-sm text-brand-muted rounded-xl bg-brand-bg/30 border border-brand-dark/10">
                        No bookings on this day yet. You can still block individual boat times below, block the whole day, or use Add booking.
                      </p>
                    );
                  }

                  // Build a unified list of items sorted by start time.
                  // Each item is either a ticketed capacity summary card or an individual booking row.
                  type DayItem =
                    | { kind: "capacity"; slot: SlotDto }
                    | { kind: "booking"; slot: SlotDto };

                  const items: DayItem[] = [
                    ...capacitySlots.map((slot): DayItem => ({ kind: "capacity", slot })),
                    // Individual booking rows: charter + ticketed individual records, deduped vs capacity
                    ...[...ticketedBookings, ...charterBookings].map((slot): DayItem => ({ kind: "booking", slot })),
                  ].sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt));

                  return (
                    <ul className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                      {items.map((item, idx) => {
                        if (item.kind === "capacity") {
                          const slot = item.slot;
                          const booked = slot.spotsBooked ?? 0;
                          const cap = slot.maxCapacity ?? 0;
                          const remaining = slot.spotsRemaining ?? Math.max(0, cap - booked);
                          const pct = cap > 0 ? booked / cap : 0;
                          const isFull = cap > 0 && remaining === 0;
                          const barColor = isFull ? "bg-rose-500" : pct >= 0.75 ? "bg-amber-500" : "bg-violet-500";
                          return (
                            <li key={`cap-${slot.id}-${idx}`} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-violet-800 text-sm">
                                  {experienceNames.get(slot.experienceId!) ?? "Ticketed Experience"}
                                </span>
                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", isFull ? "bg-rose-100 text-rose-700" : pct >= 0.75 ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700")}>
                                  {isFull ? "FULL" : `${remaining} left`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-violet-700 mb-2">
                                <span className="font-medium">{formatSlotTime(slot)}</span>
                                <span>·</span>
                                <span className="font-bold">{booked} / {cap} guests booked</span>
                              </div>
                              <div className="w-full bg-violet-100 rounded-full h-1.5">
                                <div className={cn("h-1.5 rounded-full transition-all", barColor)} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                              </div>
                            </li>
                          );
                        }

                        const slot = item.slot;
                        const summary = slot.bookingSummary;
                        const bookingId = summary?.bookingId ?? slot.bookingId;
                        const boatIdx = slot.boatId ? boatList.findIndex((b) => b.id === slot.boatId) : -1;
                        const boatColor = boatIdx >= 0 ? getBoatColorResolved(boatList[boatIdx], boatIdx) : STATUS_COLORS.booked.bg;
                        const expName = slot.experienceId && experienceNames.has(slot.experienceId) ? experienceNames.get(slot.experienceId) : null;
                        return (
                          <li
                            key={bookingId ?? `${slot.id}-${slot.boatId ?? "n"}-${slot.experienceId ?? "n"}-${idx}`}
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
                              <span className="font-semibold text-brand-dark tabular-nums text-sm">{formatBookingCardTime(slot)}</span>
                              {getBookingCardDurationLabel(slot) && (
                                <span className="text-xs text-brand-muted font-normal">· {getBookingCardDurationLabel(slot)}</span>
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
                                  onClick={() => openCancelCalendarBooking(bookingId)}
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

              {/* Quick block: one short form instead of scrolling every open slot */}
              <div className="border-t border-brand-dark/10 pt-4">
                <p className="mb-2 text-xs font-semibold text-brand-dark uppercase tracking-wide flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5" />
                  Block a boat time (no booking)
                </p>
                <p className="mb-3 text-sm text-brand-muted">
                  Pick the boat and the time range — no customer booking needed (personal use, maintenance, etc.). Times
                  are <span className="font-medium text-brand-dark">America/Chicago</span>, same as trip times.
                </p>
                {uniqueExperienceIds.length === 0 ? (
                  <p className="text-sm text-brand-muted rounded-lg border border-dashed border-brand-dark/15 bg-brand-bg/20 px-3 py-2.5">
                    Select at least one experience using the filters above, then open this day again.
                  </p>
                ) : (
                  <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/20 p-3 sm:p-4 space-y-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-brand-muted">Trip type</span>
                      <select
                        className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark"
                        value={quickBlockExperienceId}
                        onChange={(e) => setQuickBlockExperienceId(e.target.value)}
                      >
                        {uniqueExperienceIds.map((id) => (
                          <option key={id} value={id}>
                            {experienceNames.get(id) ?? id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] text-brand-muted -mt-1">
                      Blocks on a specific boat apply on every trip type for that boat (customers cannot book it on Pontoon, Holiday, etc.).
                    </p>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-brand-muted">Boat</span>
                      <select
                        className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark"
                        value={quickBlockBoatId}
                        onChange={(e) => setQuickBlockBoatId(e.target.value)}
                        disabled={quickBlockSaving}
                      >
                        <option value="">All boats (experience-wide)</option>
                        {quickBlockBoatsForExperience.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {ticketedExperienceIds.has(quickBlockExperienceId) && (
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-brand-muted">Tickets to hold back (optional)</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          placeholder="e.g. 5 — leave blank to block entire departure"
                          className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark"
                          value={quickBlockTicketsHeld}
                          onChange={(e) => setQuickBlockTicketsHeld(e.target.value)}
                          disabled={quickBlockSaving}
                        />
                        <p className="text-[11px] text-brand-muted">
                          Hold back this many tickets from online sale. Example: 10 capacity, hold back 5 → customers can still buy 5 (minus any already sold).
                        </p>
                      </label>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-brand-muted">Start</span>
                        <input
                          type="datetime-local"
                          step={BLOCK_DATETIME_LOCAL_STEP_SECONDS}
                          className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark"
                          value={quickBlockStart}
                          onChange={(e) => setQuickBlockStart(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-brand-muted">End</span>
                        <input
                          type="datetime-local"
                          step={BLOCK_DATETIME_LOCAL_STEP_SECONDS}
                          className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark"
                          value={quickBlockEnd}
                          onChange={(e) => setQuickBlockEnd(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center" role="group" aria-label="Block length presets">
                      <span className="text-[11px] font-medium text-brand-muted mr-1">Length:</span>
                      {QUICK_BLOCK_LENGTH_PRESET_HOURS.map((h) => {
                        const isSelected = quickBlockSelectedLengthHours === h;
                        return (
                          <Button
                            key={h}
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-pressed={isSelected}
                            className={cn(
                              "h-7 px-2 text-xs transition-colors",
                              isSelected &&
                                "border-brand-primary bg-brand-primary/15 text-brand-primary font-semibold shadow-sm hover:bg-brand-primary/20 hover:border-brand-primary hover:text-brand-primary",
                            )}
                            disabled={quickBlockSaving}
                            onClick={() => applyQuickBlockDurationHours(h)}
                          >
                            {h}h
                          </Button>
                        );
                      })}
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-brand-muted">Note (optional)</span>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted/70"
                        placeholder="e.g. Captain PTO, boat in shop"
                        value={quickBlockNote}
                        onChange={(e) => setQuickBlockNote(e.target.value)}
                      />
                    </label>
                    {quickBlockError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{quickBlockError}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        disabled={quickBlockSaving}
                        onClick={() => {
                          setCalendarActionConfirm({
                            title: "Block this time for this boat?",
                            description:
                              "Customers will not be able to book this boat for the selected window. If a checkout is in progress for that time, blocking may be rejected — try again after the hold expires.",
                            confirmLabel: "Block time",
                            run: runQuickBlockForDay,
                          });
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Block this window
                      </Button>
                      <p className="text-[11px] text-brand-muted">
                        Week view still supports click-to-block on the grid for fine control.
                      </p>
                    </div>
                  </div>
                )}
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
          if (!open) {
            setBookingDetailId(null);
            setRescheduleDate("");
            setRescheduleHour("7");
            setRescheduleConfirmPricing(false);
          }
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
                            : bookingDetail.waiver.status === "partial"
                              ? "bg-amber-100 text-amber-900"
                              : bookingDetail.waiver.status === "pending"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {bookingDetail.waiver.status === "signed"
                          ? "Signed"
                          : bookingDetail.waiver.status === "partial"
                            ? "Partial"
                            : bookingDetail.waiver.status}
                      </span>
                      <Link
                        href={`/admin/waivers/requests/${bookingDetail.waiver.requestId}`}
                        className="text-sm text-brand-primary hover:underline"
                      >
                        View request
                      </Link>
                      {(bookingDetail.waiver.status === "signed" || bookingDetail.waiver.status === "partial") && (
                        <a
                          href={`/api/waiver/pdf/${bookingDetail.waiver.requestId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-brand-primary hover:underline"
                        >
                          View waiver document
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {bookingDetail.slotId && BOOKING_STATUSES_SLOT_TAKEN.has(bookingDetail.status as never) && (
                <div className="rounded-lg border border-brand-dark/10 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Reschedule</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-brand-muted">
                      Date
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="mt-1 block rounded border border-brand-dark/20 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-brand-muted">
                      Start hour
                      <select
                        value={rescheduleHour}
                        onChange={(e) => setRescheduleHour(e.target.value)}
                        className="mt-1 block rounded border border-brand-dark/20 px-2 py-1 text-sm"
                      >
                        {Array.from({ length: 13 }, (_, i) => i + 7).map((h) => (
                          <option key={h} value={String(h)}>{h}:00</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-brand-muted flex items-center gap-1.5 mb-1">
                      <input
                        type="checkbox"
                        checked={rescheduleConfirmPricing}
                        onChange={(e) => setRescheduleConfirmPricing(e.target.checked)}
                        className="rounded border-brand-dark/30"
                      />
                      confirm pricing change
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={rescheduleLoading || !rescheduleDate}
                      onClick={() => void executeRescheduleFromDetail()}
                    >
                      {rescheduleLoading ? "Rescheduling..." : "Reschedule"}
                    </Button>
                  </div>
                </div>
              )}
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
                    openCancelCalendarBooking(bookingDetail.id);
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

      <Dialog
        open={cancelCalConfirmOpen}
        onOpenChange={(open) => {
          setCancelCalConfirmOpen(open);
          if (!open) {
            setCancelCalRefund(true);
            setCancelCalOverride(false);
            setCancelCalNoRefundWarn(null);
            setCancelCalPendingId(null);
          }
        }}
        title="Cancel booking?"
      >
        <div className="space-y-4 text-sm">
          <p className="text-brand-dark">This will cancel the booking and release the slot.</p>
          {cancelCalNoRefundWarn && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 text-sm">
              <p>{cancelCalNoRefundWarn}</p>
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cancelCalOverride}
                  onChange={(e) => setCancelCalOverride(e.target.checked)}
                  className="rounded border-brand-dark/30"
                />
                Override policy and proceed
              </label>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cancelCalRefund}
              onChange={(e) => setCancelCalRefund(e.target.checked)}
              className="rounded border-brand-dark/30"
            />
            Issue refund via Stripe
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCancelCalConfirmOpen(false)}>
              Back
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700"
              disabled={cancelCalLoading}
              onClick={() => void executeCancelCalendarBooking()}
            >
              {cancelCalLoading ? "Canceling…" : "Confirm cancel"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={calendarActionConfirm != null}
        onOpenChange={(open) => {
          if (!open) {
            setCalendarActionConfirm(null);
            setCalendarActionConfirmBusy(false);
          }
        }}
        title={calendarActionConfirm?.title}
        description={calendarActionConfirm?.description}
        fullScreenOnMobile
      >
        {calendarActionConfirm?.children ? (
          <div className="pb-3 pt-1">{calendarActionConfirm.children}</div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={calendarActionConfirmBusy}
            onClick={() => {
              setCalendarActionConfirm(null);
              setCalendarActionConfirmBusy(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={calendarActionConfirmBusy}
            onClick={() => {
              if (!calendarActionConfirm) return;
              setCalendarActionConfirmBusy(true);
              void calendarActionConfirm
                .run()
                .then(() => {
                  setCalendarActionConfirm(null);
                })
                .catch(() => {})
                .finally(() => setCalendarActionConfirmBusy(false));
            }}
          >
            {calendarActionConfirmBusy ? "Working…" : calendarActionConfirm?.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </Dialog>

      <AddBookingModal
        open={addBookingOpen}
        onOpenChange={setAddBookingOpen}
        onSuccess={() => {
          fetchBookings();
          fetchSlots();
        }}
      />

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex gap-2 bg-white border-t border-brand-dark/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          onClick={() => blockPanelRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="flex-1 min-h-[44px] gap-1.5"
          variant="outline"
        >
          <Lock className="h-4 w-4" /> Add Block
        </Button>
        <Button
          onClick={() => setAddBookingOpen(true)}
          className="flex-1 min-h-[44px] gap-1.5"
        >
          <CalendarIcon className="h-4 w-4" /> Add Booking
        </Button>
      </div>
    </div>
  );
}
