"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { InlineBookingDetailsStep } from "@/components/booking/InlineBookingDetailsStep";
import { BookingTypeSelector } from "./BookingTypeSelector";
import type { SlotDto } from "./ExperienceCalendarSection";

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}
function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type OnOpenInModalSelection = { experienceId?: string; experienceSlug?: string; date: string; slotId: string; boatId?: string; pricingType?: "charter" | "ticketed" };
export type OnOpenInModalFn = (selection: OnOpenInModalSelection) => void;

export interface ExperienceCalendarSectionViewProps {
  darkCard?: boolean;
  className?: string;
  onOpenInModal?: OnOpenInModalFn;
  inlineBookingHeight?: number | null;
  slidingPanelIndex: number;
  slidingPanelCount: number;
  panel1Ref: React.RefObject<HTMLDivElement | null>;
  panel2Ref: React.RefObject<HTMLDivElement | null>;
  panel3Ref: React.RefObject<HTMLDivElement | null>;
  panel4Ref?: React.RefObject<HTMLDivElement | null>;
  panel5Ref?: React.RefObject<HTMLDivElement | null>;
  inlineStepIndex?: number;
  goToInlineStep?: (step: number) => void;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
  loading: boolean;
  selectedDurationForModal: number | null;
  setSelectedDurationForModal: (v: number | null) => void;
  setSelectedSlotInline: React.Dispatch<React.SetStateAction<SlotDto | null>>;
  monthLabel: string;
  goToToday: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
  /** When false, previous month button should be disabled (e.g. seasonal experience, before allowed window). */
  canGoPrevMonth?: boolean;
  /** When false, next month button should be disabled (e.g. seasonal experience, after allowed window). */
  canGoNextMonth?: boolean;
  step2CompactGrid: ({ dateStr: string; label: string; weekday: string } | null)[];
  selectedDate: string | null;
  openCountByDateForDuration: Map<string, number>;
  slotsByDate: Map<string, { open: number; held: number; booked: number; blocked: number }>;
  slotsLength?: number;
  datePrices: Record<string, number>;
  holidayDateStrings: Set<string>;
  todayStr: string;
  handleDayClick: (dateStr: string) => void;
  selectedSlotInline: { id: string; startAt: string; endAt: string; boatId?: string; name?: string } | null;
  timeOptionsForModal: { timeLabel: string; slot: SlotDto }[];
  setShowInlineBoatStep: (v: boolean) => void;
  noAvailabilityBecauseNotSetUp: boolean;
  didFetchSlots: boolean;
  hasAnyAvailability: boolean;
  /** When true, the current month's slot fetch failed; show retry/error banner instead of "No availability." */
  monthFetchErrorForKey?: boolean;
  onRetryMonthFetch?: () => void;
  inlineBoatsLoading: boolean;
  inlineBoats: { id: string; name: string; photos?: string[] }[];
  availableBoatIdsForInlineSlot: Set<string>;
  unavailableBoatIdsForInlineSlot: Set<string>;
  bookedBoatIdsForInlineSlot: Set<string>;
  selectedBoatInline: { id: string; name: string; photos?: string[] } | null;
  setSelectedBoatInline: (v: { id: string; name: string; photos?: string[] } | null) => void;
  experienceForDetails?: { id: string; title: string; maxGuests: number; petsMax: number; allowDeposit?: boolean; allowTipNow?: boolean; allowTipLater?: boolean };
  ratesForDetails?: { id: string; durationHours: number; displayName: string; priceCents: number }[];
  addonsForDetails?: { id: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }[];
  experienceId?: string | null;
  experienceSlug?: string | null;
  showDetailsStep: boolean;
  setShowDetailsStep: (v: boolean) => void;
  inlineDetailsRate: { id: string; durationHours: number; displayName: string; priceCents: number } | null;
  inlineDetailsStepReady: boolean;
  hasInlineDetails: boolean;
  calendarMonth: Date;
  setCalendarMonth: (v: Date | ((prev: Date) => Date)) => void;
  setSelectedDate: (v: string | null) => void;
  calendarDays: {
    dateStr: string;
    day: number;
    isCurrentMonth: boolean;
    isPast: boolean;
    openCount: number;
    bookedCount: number;
    openSlots: { id: string; startAt: string; endAt: string }[];
    /** When false, date is outside seasonal window and not selectable. */
    seasonalAllowed?: boolean;
  }[];
  slotModalOpen: boolean;
  setSlotModalOpen: (v: boolean) => void;
  selectedDateLabel: string;
  directCheckout?: boolean;
  directDiscountCode: string;
  setDirectDiscountCode: (v: string) => void;
  directCheckoutLoading: string | null;
  setDirectCheckoutLoading: (v: string | null) => void;
  directCheckoutError: string | null;
  setDirectCheckoutError: (v: string | null) => void;
  bookHref?: string | null;
  /** When true, full hold/booking flow is required; direct checkout must not be used. */
  isTicketed?: boolean;
  /** Experience pricing type; both "ticketed" and "shared" require full flow (mirrors API guard). */
  pricingType?: "charter" | "ticketed" | "shared";
  departureTimeLabel?: string | null;
  ticketsAvailableByDate?: Record<string, number>;
  bookingMode?: "shared" | "charter";
  setBookingMode?: (mode: "shared" | "charter") => void;
  autoSwitchBanner?: boolean;
  setAutoSwitchBanner?: (v: boolean) => void;
  showSpotsRemaining?: boolean;
  slotDataByDate?: Map<string, { spotsRemaining: number | null; spotsBooked: number | null; isCharterLocked: boolean; showSpotsRemaining: boolean }>;
  soldOutFeedbackDate?: string | null;
  setSoldOutFeedbackDate?: (v: string | null) => void;
}

export function ExperienceCalendarSectionView(props: ExperienceCalendarSectionViewProps) {
  const {
    darkCard,
    className,
    onOpenInModal,
    inlineBookingHeight,
    slidingPanelIndex,
    slidingPanelCount,
    panel1Ref,
    panel2Ref,
    panel3Ref,
    panel4Ref,
    panel5Ref,
    inlineStepIndex = 0,
    goToInlineStep,
    rates,
    loading,
    selectedDurationForModal,
    setSelectedDurationForModal,
    setSelectedSlotInline,
    monthLabel,
    goToToday,
    goPrevMonth,
    goNextMonth,
    canGoPrevMonth = true,
    canGoNextMonth = true,
    step2CompactGrid,
    selectedDate,
    openCountByDateForDuration,
    slotsByDate,
    slotsLength = 0,
    datePrices,
    holidayDateStrings,
    todayStr,
    handleDayClick,
    selectedSlotInline,
    timeOptionsForModal,
    setShowInlineBoatStep,
    noAvailabilityBecauseNotSetUp,
    didFetchSlots,
    hasAnyAvailability,
    monthFetchErrorForKey = false,
    onRetryMonthFetch,
    inlineBoatsLoading,
    inlineBoats,
    availableBoatIdsForInlineSlot,
    unavailableBoatIdsForInlineSlot,
    bookedBoatIdsForInlineSlot,
    selectedBoatInline,
    setSelectedBoatInline,
    experienceForDetails,
    ratesForDetails,
    addonsForDetails,
    experienceId,
    experienceSlug,
    showDetailsStep,
    setShowDetailsStep,
    inlineDetailsRate,
    inlineDetailsStepReady,
    hasInlineDetails,
    calendarMonth,
    setCalendarMonth,
    setSelectedDate,
    calendarDays,
    slotModalOpen,
    setSlotModalOpen,
    selectedDateLabel,
    directCheckout,
    directDiscountCode,
    setDirectDiscountCode,
    directCheckoutLoading,
    setDirectCheckoutLoading,
    directCheckoutError,
    setDirectCheckoutError,
    bookHref,
    isTicketed = false,
    pricingType,
    departureTimeLabel,
    ticketsAvailableByDate = {},
    bookingMode = "charter",
    setBookingMode,
    autoSwitchBanner = false,
    setAutoSwitchBanner,
    showSpotsRemaining = false,
    slotDataByDate = new Map(),
    soldOutFeedbackDate = null,
    setSoldOutFeedbackDate,
  } = props;

  return (
    <>
      <section
        id="availability"
        className={cn("w-full", darkCard ? "py-4" : "py-6 sm:py-10 lg:py-16", className)}
        aria-labelledby="calendar-section-heading"
      >
        <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", darkCard ? "max-w-md sm:max-w-lg lg:max-w-xl" : "max-w-6xl")}>
          <div
            className={cn(
              darkCard
                ? "rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
                : "rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 lg:p-10 shadow-premium border border-brand-dark/5 border-t-4 border-t-brand-primary"
            )}
          >
            {isTicketed && autoSwitchBanner && !onOpenInModal && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <span>Shared spots are full — switched to private charter</span>
                <button
                  type="button"
                  onClick={() => setAutoSwitchBanner?.(false)}
                  className="shrink-0 text-amber-600 hover:text-amber-800 font-bold leading-none"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {isTicketed && !onOpenInModal && (
              rates.length > 0 ? (
                <BookingTypeSelector
                  bookingMode={bookingMode}
                  onChange={setBookingMode ?? (() => {})}
                  perPersonPrice={rates[0]?.priceCents ?? 0}
                  charterFromPrice={rates[0]?.priceCents ?? 0}
                  spotsAvailable={selectedDate ? slotDataByDate.get(selectedDate)?.spotsRemaining : undefined}
                  priceReady={true}
                />
              ) : loading ? (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-brand-dark mb-3">How would you like to book?</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className={cn("flex-1 rounded-2xl border-2 p-4 animate-pulse", darkCard ? "bg-white/10 border-white/20" : "bg-brand-dark/5 border-brand-dark/10")}>
                      <div className="h-5 w-24 mb-2 rounded bg-brand-dark/10" />
                      <div className="h-5 w-32 mb-1 rounded bg-brand-dark/10" />
                      <div className="h-6 w-20 mt-2 rounded bg-brand-dark/10" />
                    </div>
                    <div className={cn("flex-1 rounded-2xl border-2 p-4 animate-pulse", darkCard ? "bg-white/10 border-white/20" : "bg-brand-dark/5 border-brand-dark/10")}>
                      <div className="h-5 w-24 mb-2 rounded bg-brand-dark/10" />
                      <div className="h-5 w-32 mb-1 rounded bg-brand-dark/10" />
                      <div className="h-6 w-20 mt-2 rounded bg-brand-dark/10" />
                    </div>
                  </div>
                </div>
              ) : null
            )}
            {onOpenInModal != null && isTicketed ? (
              /* Ticketed: simple single-column calendar — clicking a date opens the modal directly */
              <div ref={panel2Ref as React.RefObject<HTMLDivElement>} className="flex flex-col">
                <h2 className={cn("text-xl sm:text-2xl font-extrabold tracking-tight", darkCard ? "text-white lg:text-3xl" : "text-brand-dark lg:text-3xl")}>
                  Pick your departure
                </h2>
                <p className={cn("mt-1.5 sm:mt-2 text-xs sm:text-sm", darkCard ? "text-white/80" : "text-brand-muted")}>
                  {departureTimeLabel ? `Departs at ${departureTimeLabel} · tap a date to book.` : "Tap an available date to reserve your tickets."}
                </p>
                {loading ? (
                  <div className="mt-4 space-y-2">
                    <div className={cn("h-10 w-48 animate-pulse rounded-xl", darkCard ? "bg-white/20" : "bg-brand-dark/10")} />
                    <div className={cn("h-48 w-full animate-pulse rounded-xl", darkCard ? "bg-white/20" : "bg-brand-dark/10")} />
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                      <p className={cn("text-sm font-semibold", darkCard ? "text-white/90" : "text-brand-dark")}>Date</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={goToToday} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[44px] touch-manipulation", darkCard ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "border-brand-dark/15 bg-white text-brand-dark hover:bg-brand-bg")}>Today</button>
                        <div className={cn("flex rounded-lg border p-0.5", darkCard ? "border-white/20 bg-white/10" : "border-brand-dark/10 bg-brand-bg/50")}>
                          <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className={cn("rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoPrevMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                          <span className={cn("min-w-[6rem] text-center text-xs font-semibold py-1.5 flex items-center justify-center", darkCard ? "text-white" : "text-brand-dark")}>{monthLabel}</span>
                          <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className={cn("rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoNextMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </div>
                    {soldOutFeedbackDate && (
                      <div className={cn("mt-2 rounded-lg border px-3 py-2 text-sm", darkCard ? "bg-amber-500/20 border-amber-400/40 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800")}>
                        <span className="font-medium">This date is sold out.</span>
                        {setSoldOutFeedbackDate && (
                          <button type="button" onClick={() => setSoldOutFeedbackDate(null)} className="ml-2 underline hover:no-underline" aria-label="Dismiss">
                            Dismiss
                          </button>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 md:gap-2 mt-2 min-w-0 w-full shrink-0">
                      {WEEKDAY_LABELS.map((d) => <div key={d} className={cn("py-1 text-center text-[9px] sm:text-xs font-semibold uppercase tracking-wide", darkCard ? "text-white/80" : "text-brand-muted")}>{d}</div>)}
                      {step2CompactGrid.map((cell, idx) => {
                        if (cell == null) return <div key={`blank-${idx}`} className={cn("min-h-[44px]", darkCard ? "sm:min-h-[52px]" : "sm:min-h-[48px]")} />;
                        const { dateStr, label, weekday } = cell;
                        const isSelected = selectedDate === dateStr;
                        const isPast = dateStr < todayStr;
                        const entry = slotsByDate.get(dateStr);
                        const openForDate = entry?.open ?? 0;
                        const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                        const bookedCount = entry?.booked ?? 0;
                        const slotData = slotDataByDate?.get(dateStr);
                        const isCharterLocked = slotData?.isCharterLocked ?? false;
                        const spotsLeft = slotData ? (slotData.spotsRemaining ?? null) : null;
                        const spotsBookedFirst = slotData?.spotsBooked ?? null;
                        const isTicketedCell = slotData != null;
                        const ticketsAvail = ticketsAvailableByDate?.[dateStr];
                        const isFullyBooked = !isPast && (isTicketedCell ? (spotsLeft === 0 || ticketsAvail === 0) : (entry != null && openForDate === 0) || (typeof ticketsAvail === "number" && ticketsAvail === 0));
                        const isSoldOutShared = bookingMode === "shared" && spotsLeft === 0 && !isCharterLocked;
                        const isFullyUnavailable = isCharterLocked;
                        const isAvailable = !isPast && (isTicketedCell ? (openForDate > 0 && spotsLeft !== 0) : (openForDate > 0 && !isFullyUnavailable));
                        const soldOutNoSlots = onOpenInModal != null && isTicketed && openForDate === 0;
                        const hasBookingsUrgency = !isPast && (isTicketedCell ? (spotsBookedFirst ?? 0) > 0 && spotsLeft !== 0 : (isAvailable && !isSoldOutShared && bookedCount > 0));
                        const hasBookingsOnDateFirst = isTicketedCell && !isPast && (spotsBookedFirst ?? 0) > 0;
                        const displayBookedFirst = isTicketedCell ? (spotsBookedFirst ?? 0) : bookedCount;
                        const priceCents = datePrices[dateStr];
                        const isHoliday = holidayDateStrings.has(dateStr);
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={isPast || (!isAvailable && !isSoldOutShared) || isFullyUnavailable || soldOutNoSlots}
                            onClick={() => ((onOpenInModal != null && isTicketed ? isAvailable : (isAvailable || isSoldOutShared)) && handleDayClick(dateStr))}
                            title={isHoliday ? "Holiday pricing" : hasBookingsUrgency ? `${displayBookedFirst} already booked this day` : undefined}
                            className={cn(
                              "rounded-lg sm:rounded-xl border-2 p-0.5 sm:p-1 text-center transition-all flex flex-col justify-center gap-0 min-w-0 w-full min-h-[44px] min-w-[44px] sm:min-h-[58px] md:min-h-[64px] touch-manipulation",
                              darkCard ? "sm:min-h-[52px]" : "sm:min-h-[58px]",
                              isHoliday && "ring-1.5 ring-violet-400/80",
                              darkCard
                                ? cn(
                                    isPast && "opacity-60 cursor-not-allowed border-white/20 text-white/50",
                                    !isPast && !isAvailable && !isSoldOutShared && !isFullyBooked && "border-white/20 text-white/50 bg-white/5 cursor-not-allowed",
                                    isFullyBooked && "bg-red-500/20 text-red-200 border-red-400/50 cursor-not-allowed",
                                    isSoldOutShared && "bg-amber-500/20 text-amber-200 border-amber-400/40 cursor-pointer",
                                    (hasBookingsUrgency || hasBookingsOnDateFirst) && !isFullyBooked && !isSoldOutShared && "bg-amber-500/25 text-amber-200 border-amber-400/50",
                                    isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDateFirst && !isFullyBooked && "bg-emerald-500/30 text-white border-emerald-400/60 hover:bg-emerald-500/45 hover:border-emerald-400",
                                    isAvailable && isHoliday && !hasBookingsUrgency && !hasBookingsOnDateFirst && !isFullyBooked && "text-white border-violet-400/60 hover:bg-violet-500/25",
                                    isSelected && "border-brand-primary bg-brand-primary/50 text-white font-semibold ring-2 ring-brand-primary/60"
                                  )
                                : cn(
                                    isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                                    !isPast && !isAvailable && !isSoldOutShared && !isFullyBooked && "bg-brand-dark/10 text-brand-muted border-brand-dark/15 cursor-not-allowed",
                                    isFullyBooked && "bg-red-100/95 text-red-900 border-red-400/60 cursor-not-allowed",
                                    isSoldOutShared && "bg-amber-50 text-amber-800 border-amber-300 cursor-pointer",
                                    (hasBookingsUrgency || hasBookingsOnDateFirst) && !isFullyBooked && !isSoldOutShared && !isHoliday && "bg-amber-50/95 text-amber-900 border-amber-400/50",
                                    (hasBookingsUrgency || hasBookingsOnDateFirst) && !isFullyBooked && !isSoldOutShared && isHoliday && "bg-amber-50/90 border-amber-400/50 text-amber-900",
                                    isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDateFirst && !isFullyBooked && !isHoliday && "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60 active:scale-[0.98]",
                                    isAvailable && isHoliday && !hasBookingsUrgency && !hasBookingsOnDateFirst && !isFullyBooked && "text-violet-900 border-violet-400/60 hover:bg-violet-100 active:scale-[0.98]",
                                    isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-2 ring-brand-primary/40"
                                  )
                            )}
                          >
                            <span className={cn("block text-[8px] sm:text-[10px] uppercase leading-tight truncate", darkCard ? "text-white/70" : "text-brand-muted")}>{weekday}</span>
                            <span className={cn("block font-semibold text-[9px] sm:text-[10px] md:text-sm leading-tight truncate", darkCard && (isAvailable || isSelected) ? "text-white" : darkCard ? "text-white/80" : "")}>{label.split(" ")[1] ?? label}</span>
                            {isFullyUnavailable && <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-white/60" : "text-brand-muted")}>Unavailable</span>}
                            {!isFullyUnavailable && isSoldOutShared && (
                              <>
                                <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-amber-200" : "text-amber-700")}>Sold out</span>
                                <span className={cn("block text-[7px] sm:text-[8px] leading-tight truncate", darkCard ? "text-amber-300/80" : "text-amber-600/80")}>Charter avail.</span>
                              </>
                            )}
                            {!isFullyUnavailable && (hasBookingsUrgency || hasBookingsOnDateFirst) && (
                              <span className={cn("block text-[8px] sm:text-[10px] font-semibold leading-tight truncate mt-0.5", darkCard ? "text-amber-200" : "text-amber-700")}>{displayBookedFirst} booked</span>
                            )}
                            {!isFullyUnavailable && isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDateFirst && showSpotsRemaining && spotsLeft !== null && spotsLeft > 0 && (
                              <span className={cn("block text-[8px] sm:text-[9px] font-bold leading-tight truncate", darkCard ? "text-amber-200" : "text-amber-700")}>{spotsLeft} left</span>
                            )}
                            {!isFullyUnavailable && isFullyBooked && <span className={cn("block text-[8px] sm:text-[10px] font-semibold leading-tight truncate mt-0.5", darkCard ? "text-red-200" : "text-red-700")}>Full</span>}
                            {!isFullyUnavailable && isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDateFirst && !isFullyBooked && !(showSpotsRemaining && spotsLeft !== null && spotsLeft > 0) && (
                              typeof priceCents === "number"
                                ? <span className={cn("block text-[10px] sm:text-xs font-bold leading-tight truncate mt-0.5", darkCard ? "text-emerald-200" : "text-emerald-800")}>${(priceCents / 100).toFixed(0)}/ea</span>
                                : <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-emerald-200" : "text-emerald-800")}>Open</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {monthFetchErrorForKey && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800">
                      <p>Could not load availability for this month.</p>
                      {onRetryMonthFetch && (
                        <button type="button" onClick={onRetryMonthFetch} className="mt-2 font-medium underline hover:no-underline">
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                    {!monthFetchErrorForKey && didFetchSlots && !loading && !hasAnyAvailability && !noAvailabilityBecauseNotSetUp && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800"><p>No availability for this month.</p></div>}
                  </>
                )}
              </div>
            ) : onOpenInModal ? (
              slidingPanelCount >= 4 ? (
                /* 5-step sliding layout: duration → date → time → boat → details (no modals) */
                <div
                  className="overflow-hidden w-full transition-[height] duration-300 ease-out"
                  style={inlineBookingHeight != null ? { height: inlineBookingHeight, minHeight: inlineBookingHeight } : undefined}
                >
                <div
                  className={cn(
                    "flex h-full min-h-full transition-transform duration-300 ease-out",
                    slidingPanelCount === 5 && "w-[500%]",
                    slidingPanelCount === 4 && "w-[400%]",
                      slidingPanelCount === 5 && slidingPanelIndex === 0 && "translate-x-0",
                      slidingPanelCount === 5 && slidingPanelIndex === 1 && "-translate-x-[20%]",
                      slidingPanelCount === 5 && slidingPanelIndex === 2 && "-translate-x-[40%]",
                      slidingPanelCount === 5 && slidingPanelIndex === 3 && "-translate-x-[60%]",
                      slidingPanelCount === 5 && slidingPanelIndex === 4 && "-translate-x-[80%]",
                      slidingPanelCount === 4 && slidingPanelIndex === 0 && "translate-x-0",
                      slidingPanelCount === 4 && slidingPanelIndex === 1 && "-translate-x-[25%]",
                      slidingPanelCount === 4 && slidingPanelIndex === 2 && "-translate-x-[50%]",
                      slidingPanelCount === 4 && slidingPanelIndex === 3 && "-translate-x-[75%]"
                    )}
                  >
                    {/* Step 0: Duration (skipped for ticketed — jump straight to step 1) */}
                    <div
                      ref={panel1Ref as React.RefObject<HTMLDivElement>}
                      className={cn(
                        "flex flex-col flex-shrink-0 min-w-0 overflow-hidden pr-2 h-full min-h-0",
                        slidingPanelCount === 5 ? "w-1/5" : "w-1/4"
                      )}
                    >
                      <div className="shrink-0">
                        <h2
                          id="calendar-section-heading"
                          className={cn(
                            "text-xl sm:text-2xl font-extrabold tracking-tight",
                            darkCard ? "text-white lg:text-3xl" : "text-brand-dark lg:text-3xl"
                          )}
                        >
                          {isTicketed ? "Pick your departure" : "Pick your date & time"}
                        </h2>
                        <p className={cn("mt-1.5 sm:mt-2 text-xs sm:text-sm", darkCard ? "text-white/80" : "text-brand-muted")}>
                          {isTicketed
                            ? "Select an available date to reserve your tickets."
                            : "Choose a duration, then date, time, boat, and checkout."}
                        </p>
                      </div>
                      {loading ? (
                        <div className="mt-4 space-y-4">
                          <div className={cn("h-10 w-48 animate-pulse rounded-xl", darkCard ? "bg-white/20" : "bg-brand-dark/10")} />
                        </div>
                      ) : (
                        <div className="mt-4 sm:mt-6 flex min-h-0 flex-1 flex-col">
                          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
                            {rates.length > 0 && !isTicketed && (
                              <div>
                                <p className={cn("text-sm font-semibold mb-2", darkCard ? "text-white/90" : "text-brand-dark")}>
                                  Duration
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {[...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => {
                                    const isSelected = selectedDurationForModal === r.durationHours;
                                    return (
                                      <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedDurationForModal(r.durationHours);
                                          setSelectedSlotInline(null);
                                        }}
                                        className={cn(
                                          "rounded-xl border-2 px-3 py-2.5 sm:py-3 text-sm font-semibold transition-all min-h-[44px] touch-manipulation",
                                          darkCard
                                            ? isSelected
                                              ? "border-brand-primary bg-brand-primary text-white"
                                              : "border-white/30 text-white/90 hover:border-white/50"
                                            : isSelected
                                              ? "border-brand-primary bg-brand-primary/10 text-brand-dark"
                                              : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                                        )}
                                      >
                                        {r.displayName ?? `${r.durationHours} hr`}
                                      </button>
                                    );
                                  })}
                                </div>
                                {selectedDurationForModal == null && (
                                  <p className={cn("mt-2 text-xs", darkCard ? "text-white/70" : "text-brand-muted")}>
                                    Select a duration to see available dates.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {selectedDurationForModal != null && goToInlineStep && (
                            <div className="pt-3 shrink-0">
                              <button
                                type="button"
                                onClick={() => goToInlineStep(1)}
                                className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 transition-colors text-sm"
                              >
                                Next: Pick date
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Step 1: Date */}
                    <div
                      ref={panel2Ref as React.RefObject<HTMLDivElement>}
                      className={cn(
                        "flex flex-col flex-shrink-0 min-w-0 overflow-hidden pr-2 h-full min-h-0",
                        slidingPanelCount === 5 ? "w-1/5" : "w-1/4"
                      )}
                    >
                      <h2 className={cn("text-xl sm:text-2xl font-extrabold tracking-tight shrink-0", darkCard ? "text-white" : "text-brand-dark")}>
                        {isTicketed ? "Pick your departure" : "Pick your date"}
                      </h2>
                      <p className={cn("mt-1 text-xs sm:text-sm shrink-0", darkCard ? "text-white/80" : "text-brand-muted")}>
                        {isTicketed
                          ? departureTimeLabel
                            ? `Departs at ${departureTimeLabel} · tap a date to book.`
                            : "Tap an available date to reserve your tickets."
                          : "Select a date for your charter."}
                      </p>
                      {!loading && (selectedDurationForModal != null || isTicketed) && (
                        <>
                          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                            <p className={cn("text-sm font-semibold", darkCard ? "text-white/90" : "text-brand-dark")}>Date</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button type="button" onClick={goToToday} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[44px] touch-manipulation", darkCard ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "border-brand-dark/15 bg-white text-brand-dark hover:bg-brand-bg")}>Today</button>
                              <div className={cn("flex rounded-lg border p-0.5", darkCard ? "border-white/20 bg-white/10" : "border-brand-dark/10 bg-brand-bg/50")}>
                                <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className={cn("rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoPrevMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                                <span className={cn("min-w-[6rem] text-center text-xs font-semibold py-1.5 flex items-center justify-center", darkCard ? "text-white" : "text-brand-dark")}>{monthLabel}</span>
                                <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className={cn("rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoNextMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
                              </div>
                            </div>
                          </div>
                          {soldOutFeedbackDate && (
                            <div className={cn("mt-2 rounded-lg border px-3 py-2 text-sm", darkCard ? "bg-amber-500/20 border-amber-400/40 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800")}>
                              <span className="font-medium">This date is sold out.</span>
                              {setSoldOutFeedbackDate && (
                                <button type="button" onClick={() => setSoldOutFeedbackDate(null)} className="ml-2 underline hover:no-underline" aria-label="Dismiss">Dismiss</button>
                              )}
                            </div>
                          )}
                          <div className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
                            <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 md:gap-2 mt-2 min-w-0 w-full">
                              {WEEKDAY_LABELS.map((d) => <div key={d} className={cn("py-1 text-center text-[9px] sm:text-xs font-semibold uppercase tracking-wide", darkCard ? "text-white/80" : "text-brand-muted")}>{d}</div>)}
                              {step2CompactGrid.map((cell, idx) => {
                                if (cell == null) return <div key={`blank-${idx}`} className={cn("min-h-[44px]", darkCard ? "sm:min-h-[52px]" : "sm:min-h-[48px]")} />;
                                const { dateStr, label, weekday } = cell;
                                const isSelected = selectedDate === dateStr;
                                const isPast = dateStr < todayStr;
                                const openForDuration = isTicketed
                                  ? (slotsByDate.get(dateStr)?.open ?? 0)
                                  : (openCountByDateForDuration.get(dateStr) ?? 0);
                                const entry = slotsByDate.get(dateStr);
                                const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                                const bookedCount = entry?.booked ?? 0;
                                const hasPriceForDay = typeof datePrices[dateStr] === "number";
                                const isAvailable = !isPast && (openForDuration > 0 || (slotsLength === 0 && hasPriceForDay));
                                const priceCents = datePrices[dateStr];
                                const isHoliday = holidayDateStrings.has(dateStr);
                                const slotData = isTicketed ? slotDataByDate.get(dateStr) : undefined;
                                const isCharterLocked = slotData?.isCharterLocked ?? false;
                                const spotsLeft = slotData ? (slotData.spotsRemaining ?? null) : null;
                                const spotsBooked = slotData?.spotsBooked ?? null;
                                const isSoldOutShared = isTicketed && bookingMode === "shared" && spotsLeft === 0 && !isCharterLocked;
                                const isFullyUnavailable = isTicketed && isCharterLocked;
                                const ticketsAvail2 = ticketsAvailableByDate?.[dateStr];
                                const isFullyBookedTicketed = isTicketed && !isPast && (spotsLeft === 0 && slotData != null || (typeof ticketsAvail2 === "number" && ticketsAvail2 === 0));
                                const isFullyBookedCharter = !isTicketed && !isPast && entry != null && openForDuration === 0;
                                const isFullyBooked = isFullyBookedTicketed || isFullyBookedCharter;
                                const soldOutNoSlots2 = onOpenInModal != null && isTicketed && (slotsByDate.get(dateStr)?.open ?? 0) === 0;
                                const hasBookingsUrgencyTicketed = isTicketed && !isPast && (spotsBooked ?? 0) > 0 && spotsLeft !== 0;
                                const hasBookingsUrgencyCharter = !isTicketed && !isPast && (openForDuration > 0 || (slotsLength === 0 && typeof datePrices[dateStr] === "number")) && bookedCount > 0 && !isFullyBooked;
                                const hasBookingsUrgency = hasBookingsUrgencyTicketed || hasBookingsUrgencyCharter;
                                const hasBookingsOnDate = isTicketed && !isPast && (spotsBooked ?? 0) > 0;
                                const displayBookedCount = isTicketed ? (spotsBooked ?? 0) : bookedCount;
                                return (
                                  <button
                                    key={dateStr}
                                    type="button"
                                    disabled={isPast || !isAvailable || isFullyUnavailable || soldOutNoSlots2}
                                    onClick={() => ((onOpenInModal != null && isTicketed ? isAvailable : (isAvailable || isSoldOutShared)) && handleDayClick(dateStr))}
                                    title={isHoliday ? "Holiday pricing" : (hasBookingsUrgency || hasBookingsOnDate) ? `${displayBookedCount} already booked this day` : undefined}
                                    className={cn(
                                      "rounded-lg sm:rounded-xl border-2 p-0.5 sm:p-1 text-center transition-all flex flex-col justify-center gap-0 min-w-0 w-full min-h-[44px] min-w-[44px] sm:min-h-[58px] touch-manipulation",
                                      darkCard ? "sm:min-h-[52px]" : "sm:min-h-[58px]",
                                      isHoliday && "ring-1.5 ring-violet-400/80",
                                      darkCard && isHoliday && !isPast && "bg-violet-500/15 border-violet-400/40",
                                      !darkCard && isHoliday && !isPast && "bg-violet-50/90 border-violet-300/60",
                                      darkCard
                                        ? cn(
                                            isPast && "opacity-60 cursor-not-allowed border-white/20 text-white/50",
                                            !isPast && !isAvailable && !isFullyBooked && !isSoldOutShared && "border-white/20 text-white/50 bg-white/5 cursor-not-allowed",
                                            isFullyBooked && "bg-red-500/20 text-red-200 border-red-400/50 cursor-not-allowed",
                                            isSoldOutShared && "bg-amber-500/20 text-amber-200 border-amber-400/40 cursor-pointer",
                                            (hasBookingsUrgency || hasBookingsOnDate) && "bg-amber-500/25 text-amber-200 border-amber-400/50",
                                            isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDate && !isFullyBooked && !isHoliday && "bg-emerald-500/30 text-white border-emerald-400/60 hover:bg-emerald-500/45 hover:border-emerald-400",
                                            isAvailable && !isSoldOutShared && isHoliday && !hasBookingsUrgency && !hasBookingsOnDate && !isFullyBooked && "text-white border-violet-400/60 hover:bg-violet-500/25",
                                            isSelected && "border-brand-primary bg-brand-primary/50 text-white font-semibold ring-2 ring-brand-primary/60"
                                          )
                                        : cn(
                                            isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                                            !isPast && !isAvailable && !isFullyBooked && !isSoldOutShared && "bg-brand-dark/10 text-brand-muted border-brand-dark/15 cursor-not-allowed",
                                            isFullyBooked && "bg-red-100/95 text-red-900 border-red-400/60 cursor-not-allowed",
                                            isSoldOutShared && "bg-amber-50 text-amber-800 border-amber-300 cursor-pointer",
                                            (hasBookingsUrgency || hasBookingsOnDate) && !isHoliday && "bg-amber-50/95 text-amber-900 border-amber-400/50",
                                            (hasBookingsUrgency || hasBookingsOnDate) && isHoliday && "bg-amber-50/90 border-amber-400/50 text-amber-900",
                                            isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDate && !isFullyBooked && !isHoliday && "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60 active:scale-[0.98]",
                                            isAvailable && isHoliday && !hasBookingsUrgency && !hasBookingsOnDate && !isFullyBooked && "text-violet-900 border-violet-400/60 hover:bg-violet-100 active:scale-[0.98]",
                                            isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-2 ring-brand-primary/40"
                                          )
                                    )}
                                  >
                                    <span className={cn("block text-[8px] sm:text-[10px] uppercase leading-tight truncate", darkCard ? "text-white/70" : "text-brand-muted")}>{weekday}</span>
                                    <span className={cn("block font-semibold text-[9px] sm:text-[10px] leading-tight truncate", darkCard && (isAvailable || isSelected) ? "text-white" : darkCard ? "text-white/80" : "")}>{label.split(" ")[1] ?? label}</span>
                                    {isTicketed && isFullyUnavailable && (
                                      <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-white/60" : "text-brand-muted")}>Unavailable</span>
                                    )}
                                    {isTicketed && !isFullyUnavailable && isSoldOutShared && (
                                      <>
                                        <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-amber-200" : "text-amber-700")}>Sold out</span>
                                        <span className={cn("block text-[7px] sm:text-[8px] leading-tight truncate", darkCard ? "text-amber-300/80" : "text-amber-600/80")}>Charter avail.</span>
                                      </>
                                    )}
                                    {(hasBookingsUrgency || hasBookingsOnDate) && (
                                      <span className={cn("block text-[8px] sm:text-[10px] font-semibold leading-tight truncate mt-0.5", darkCard ? "text-amber-200" : "text-amber-700")}>{displayBookedCount} booked</span>
                                    )}
                                    {isTicketed && !isFullyUnavailable && showSpotsRemaining && spotsLeft !== null && spotsLeft > 0 && isAvailable && !hasBookingsUrgency && !hasBookingsOnDate && (
                                      <span className={cn("block text-[8px] sm:text-[9px] font-bold leading-tight truncate", darkCard ? "text-amber-200" : "text-amber-700")}>{spotsLeft} left</span>
                                    )}
                                    {isTicketed && !isFullyUnavailable && isAvailable && !isSoldOutShared && !hasBookingsUrgency && !hasBookingsOnDate && !(showSpotsRemaining && spotsLeft !== null && spotsLeft > 0) && (() => {
                                      if (typeof priceCents === "number") {
                                        return <span className={cn("block text-[10px] sm:text-xs font-bold leading-tight truncate", darkCard ? "text-emerald-200" : isSelected ? "text-brand-primary" : "text-emerald-800")}>${(priceCents / 100).toFixed(0)}/ea</span>;
                                      }
                                      return <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-emerald-200" : "text-emerald-800")}>Open</span>;
                                    })()}
                                    {!isTicketed && typeof priceCents === "number" && isAvailable && <span className={cn("block text-[10px] sm:text-xs font-bold leading-tight truncate", darkCard ? "text-emerald-200" : isSelected ? "text-brand-primary" : "text-emerald-800")}>${(priceCents / 100).toFixed(0)}</span>}
                                    {isFullyBooked && <span className={cn("block text-[8px] sm:text-[10px] font-semibold leading-tight truncate mt-0.5", darkCard ? "text-red-200" : "text-red-700")}>Full</span>}
                                  </button>
                                );
                              })}
                            </div>

                            {noAvailabilityBecauseNotSetUp && (
                              <div className={cn("mt-4 rounded-2xl border px-4 py-3 text-sm", darkCard ? "border-white/20 text-white/80" : "border-brand-dark/10 text-brand-muted")}>
                                <p>Calendar not loading. Check Firebase and run setup in /admin.</p>
                              </div>
                            )}
                            {monthFetchErrorForKey && (
                              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800">
                                <p>Could not load availability for this month.</p>
                                {onRetryMonthFetch && (
                                  <button type="button" onClick={onRetryMonthFetch} className="mt-2 font-medium underline hover:no-underline">
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                            {!monthFetchErrorForKey && didFetchSlots && !loading && !hasAnyAvailability && !noAvailabilityBecauseNotSetUp && (
                              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
                                <p>No availability for this month.</p>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2 shrink-0">
                            {goToInlineStep && <button type="button" onClick={() => goToInlineStep(0)} className={cn("rounded-xl border-2 px-3 py-2 text-sm font-medium min-h-[44px] touch-manipulation", darkCard ? "border-white/40 text-white hover:bg-white/20" : "border-brand-dark/15 text-brand-dark hover:bg-brand-bg")}>Back</button>}
                            {selectedDate && goToInlineStep && <button type="button" onClick={() => goToInlineStep(2)} className="flex-1 rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 text-sm">Next: Pick time</button>}
                          </div>
                        </>
                      )}
                    </div>
                    {/* Step 2: Time */}
                    <div
                      ref={panel3Ref as React.RefObject<HTMLDivElement>}
                      className={cn(
                        "flex flex-col flex-shrink-0 min-w-0 overflow-hidden pr-2 h-full min-h-0",
                        slidingPanelCount === 5 ? "w-1/5" : "w-1/4"
                      )}
                    >
                      <h2 className={cn("text-xl sm:text-2xl font-extrabold tracking-tight shrink-0", darkCard ? "text-white" : "text-brand-dark")}>Pick your time</h2>
                      <p className={cn("mt-1 text-xs sm:text-sm shrink-0", darkCard ? "text-white/80" : "text-brand-muted")}>Choose a start time for {selectedDate ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }) : "your date"}.</p>
                      {selectedDate && (
                        <>
                          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
                            {loading ? (
                              <div className={cn("flex flex-col items-center justify-center py-8 gap-3", darkCard ? "text-white/90" : "text-brand-muted")}>
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                                <p className="text-sm font-medium">Checking availability…</p>
                                <p className="text-xs">Please wait — we’re fetching the latest slots.</p>
                              </div>
                            ) : timeOptionsForModal.length === 0 ? (
                              <p className={cn("text-xs", darkCard ? "text-white/70" : "text-brand-muted")}>
                                No open slots for this duration on this day.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2 content-start touch-pan-y">
                                {timeOptionsForModal.map(({ timeLabel, slot }) => {
                                  const isSelected = selectedSlotInline?.id === slot.id;
                                  return (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      onClick={() => setSelectedSlotInline(slot)}
                                      className={cn(
                                        "rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all flex-shrink-0 min-h-[44px] touch-manipulation",
                                        darkCard
                                          ? isSelected
                                            ? "border-brand-primary bg-brand-primary text-white"
                                            : "border-white/30 text-white/90 hover:border-white/50"
                                          : isSelected
                                            ? "border-brand-primary bg-brand-primary/10 text-brand-dark"
                                            : "border-brand-dark/15 hover:border-brand-dark/30"
                                      )}
                                    >
                                      {timeLabel}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2 shrink-0">
                            {goToInlineStep && <button type="button" onClick={() => goToInlineStep(1)} className={cn("rounded-xl border-2 px-3 py-2 text-sm font-medium min-h-[44px] touch-manipulation", darkCard ? "border-white/40 text-white hover:bg-white/20" : "border-brand-dark/15 text-brand-dark hover:bg-brand-bg")}>Back</button>}
                            <button type="button" disabled={loading || !selectedSlotInline} onClick={() => selectedSlotInline && goToInlineStep?.(3)} className="flex-1 rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 disabled:opacity-50 text-sm">Continue to choose your boat</button>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Step 3: Boat */}
                    <div
                      ref={panel4Ref as React.RefObject<HTMLDivElement>}
                      className={cn(
                        "flex flex-col flex-shrink-0 min-w-0 overflow-hidden pl-2 h-full min-h-0",
                        slidingPanelCount === 5 ? "w-1/5" : "w-1/4"
                      )}
                    >
                      {selectedDate && selectedSlotInline ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <h3 className={cn("text-lg font-bold tracking-tight", darkCard ? "text-white" : "text-brand-dark")}>Choose your boat</h3>
                            {goToInlineStep && <button type="button" onClick={() => goToInlineStep(2)} className="text-xs font-medium text-white/80 hover:text-white">Change time</button>}
                          </div>
                          <p className={cn("text-xs mb-3", darkCard ? "text-white/70" : "text-brand-muted")}>{selectedDate} · {formatTime(selectedSlotInline.startAt)}</p>
                          {!inlineBoatsLoading && inlineBoats.length > 0 && availableBoatIdsForInlineSlot.size === 0 ? (
                            <div className={cn("rounded-lg border p-4 mb-3", darkCard ? "bg-amber-500/20 border-amber-400/50 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-900")}>
                              <p className="text-sm font-medium">This time is no longer available.</p>
                              <p className="text-xs mt-1 opacity-90">It may have just been booked. Please choose another time.</p>
                              {goToInlineStep && <button type="button" onClick={() => goToInlineStep(2)} className={cn("mt-3 w-full rounded-lg font-semibold py-2.5 px-3 text-sm", darkCard ? "bg-amber-500/30 hover:bg-amber-500/40 text-white border border-amber-400/50" : "bg-amber-200 hover:bg-amber-300 text-amber-900 border border-amber-300")}>Choose another time</button>}
                            </div>
                          ) : null}
                          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
                            {inlineBoatsLoading ? <div className="py-4 flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" /></div> : inlineBoats.length === 0 ? <p className={cn("text-xs py-2", darkCard ? "text-white/70" : "text-brand-muted")}>No boats assigned — continue to details.</p> : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-2">
                                {inlineBoats.slice(0, 6).map((boat) => {
                                  const isAvailable = availableBoatIdsForInlineSlot.has(boat.id) && !unavailableBoatIdsForInlineSlot.has(boat.id);
                                  const isBooked = bookedBoatIdsForInlineSlot.has(boat.id);
                                  const isSelected = selectedBoatInline?.id === boat.id;
                                  const thumb = boat.photos?.[0];
                                  return (
                                    <button key={boat.id} type="button" disabled={!isAvailable} onClick={() => isAvailable && setSelectedBoatInline(boat)} className={cn("relative flex flex-col overflow-hidden rounded-md border-2 text-left transition-all min-h-0", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary", isSelected ? "border-brand-primary bg-brand-primary ring-2 ring-brand-primary/30" : "border-brand-dark/15 bg-white hover:border-brand-dark/30", !isAvailable && "cursor-not-allowed opacity-70", isBooked && "border-brand-dark/25 bg-brand-dark/5")}>
                                      <div className="relative w-full aspect-[4/3] bg-brand-dark/10 shrink-0 overflow-hidden rounded-t">{thumb ? <Image src={getDisplayImageUrl(thumb)} alt="" fill className="object-cover" sizes="80px" /> : <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />}</div>
                                      {isBooked && (
                                        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-500/70 z-10 pointer-events-none" aria-hidden>
                                          <span className="text-[10px] font-bold text-white uppercase tracking-wide px-2 py-1 rounded bg-slate-800/90 border border-white/20">Booked</span>
                                        </div>
                                      )}
                                      <div className={cn("px-1.5 py-1 min-w-0", isBooked && "relative z-0")}><span className={cn("text-[10px] font-semibold truncate block", isSelected ? "text-white" : isAvailable ? "text-brand-dark" : "text-brand-muted")}>{boat.name}{isBooked ? " (Booked)" : ""}</span></div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 mt-3">
                            <button type="button" disabled={inlineBoatsLoading || (inlineBoats.length > 0 && !selectedBoatInline)} onClick={() => { if (!selectedDate || !selectedSlotInline) return; if (experienceForDetails && ratesForDetails && addonsForDetails) goToInlineStep?.(4); else onOpenInModal?.({ experienceId: experienceId ?? undefined, experienceSlug: experienceSlug ?? undefined, date: selectedDate, slotId: selectedSlotInline.id, boatId: selectedBoatInline?.id ?? (selectedSlotInline as { boatId?: string }).boatId }); }} className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation text-sm hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Continue to checkout</button>
                            {goToInlineStep && <button type="button" onClick={() => goToInlineStep(2)} className="w-full rounded-lg border-2 border-white/30 px-3 py-2 min-h-[44px] touch-manipulation text-xs font-semibold text-white hover:bg-white/10">Change time</button>}
                          </div>
                        </>
                      ) : <p className={cn("text-sm py-4", darkCard ? "text-white/80" : "text-brand-muted")}>Select date and time first.</p>}
                    </div>
                    {/* Step 4: Details & payment (only when hasInlineDetails) */}
                    {slidingPanelCount === 5 && hasInlineDetails && panel5Ref && (
                      <div ref={panel5Ref as React.RefObject<HTMLDivElement>} className="w-1/5 flex-shrink-0 pl-2 min-w-0 overflow-hidden flex flex-col h-full">
                        {selectedDate && selectedSlotInline && experienceForDetails && (!inlineDetailsStepReady ? <p className={cn("text-sm py-4", darkCard ? "text-white/80" : "text-brand-muted")}>Loading…</p> : (
                          <>
                            {goToInlineStep && <button type="button" onClick={() => goToInlineStep(3)} className={cn("mb-2 text-xs font-medium shrink-0", darkCard ? "text-white/80 hover:text-white" : "text-brand-muted hover:text-brand-primary")}>← Back to boat</button>}
                            <div className={cn("min-h-0 flex-1 overflow-y-auto rounded-xl", darkCard && "bg-white text-brand-dark shadow-lg p-4")}>
                              <InlineBookingDetailsStep experienceId={experienceForDetails.id} experienceTitle={experienceForDetails.title} experienceMaxGuests={experienceForDetails.maxGuests} experiencePetsMax={experienceForDetails.petsMax} allowDeposit={experienceForDetails.allowDeposit} allowTipNow={experienceForDetails.allowTipNow} allowTipLater={experienceForDetails.allowTipLater} boatId={selectedBoatInline?.id} boatName={selectedBoatInline?.name} slot={{ id: selectedSlotInline.id, startAt: selectedSlotInline.startAt, endAt: selectedSlotInline.endAt }} rateId={inlineDetailsRate!.id} rateDisplayName={inlineDetailsRate!.displayName ?? `${inlineDetailsRate!.durationHours} hr`} rateDurationHours={inlineDetailsRate!.durationHours} selectedDate={selectedDate} addons={addonsForDetails ?? []} onBack={() => goToInlineStep?.(3)} onSuccess={() => { goToInlineStep?.(0); setShowInlineBoatStep(false); setShowDetailsStep(false); }} bookingMode={bookingMode} spotsRemaining={selectedDate ? slotDataByDate.get(selectedDate)?.spotsRemaining : undefined} />
                            </div>
                          </>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
              /* Original 3-panel layout (duration+date+time | boat | details) */
              <div
                className="overflow-hidden w-full transition-[height] duration-300 ease-out"
                style={inlineBookingHeight != null ? { height: inlineBookingHeight } : undefined}
              >
                <div
                  className={cn(
                    "flex flex-col sm:flex-row transition-transform duration-300 ease-out",
                    slidingPanelIndex === 2 && "sm:items-start",
                    slidingPanelCount === 3 ? "sm:w-[300%]" : "sm:w-[200%]",
                    slidingPanelCount === 3 && slidingPanelIndex === 0 && "sm:translate-x-0",
                    slidingPanelCount === 3 && slidingPanelIndex === 1 && "sm:-translate-x-[33.333%]",
                    slidingPanelCount === 3 && slidingPanelIndex === 2 && "sm:-translate-x-[66.666%]",
                    slidingPanelCount === 2 && slidingPanelIndex === 0 && "sm:translate-x-0",
                    slidingPanelCount === 2 && slidingPanelIndex === 1 && "sm:-translate-x-1/2"
                  )}
                >
                  {/* Panel 1: Pick date & time */}
                  <div
                    ref={panel1Ref as React.RefObject<HTMLDivElement>}
                    className={slidingPanelCount === 3 ? "w-full sm:w-1/3 flex-shrink-0 sm:pr-2 min-w-0" : "w-full sm:w-1/2 flex-shrink-0 sm:pr-2"}
                  >
                    <h2
                      id="calendar-section-heading"
                      className={cn(
                        "text-xl sm:text-2xl font-extrabold tracking-tight",
                        darkCard ? "text-white lg:text-3xl" : "text-brand-dark lg:text-3xl"
                      )}
                    >
                      Pick your date & time
                    </h2>
                    <p className={cn("mt-1.5 sm:mt-2 text-xs sm:text-sm", darkCard ? "text-white/80" : "text-brand-muted")}>
                      Choose a duration, date, and time — then choose your boat and checkout.
                    </p>
                    {loading ? (
                      <div className="mt-4 sm:mt-6 space-y-4">
                        <div className={cn("h-10 w-48 animate-pulse rounded-xl", darkCard ? "bg-white/20" : "bg-brand-dark/10")} />
                        <div className="grid grid-cols-7 gap-1">
                          {Array.from({ length: 35 }, (_, i) => (
                            <div key={i} className={cn("aspect-square animate-pulse rounded-lg", darkCard ? "bg-white/20" : "bg-brand-dark/10")} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 sm:mt-6 space-y-4">
                        {rates.length > 0 && (
                          <div>
                            <p className={cn("text-sm font-semibold mb-2", darkCard ? "text-white/90" : "text-brand-dark")}>Duration</p>
                            <div className="flex flex-wrap gap-2">
                              {[...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => {
                                const isSelected = selectedDurationForModal === r.durationHours;
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedDurationForModal(r.durationHours);
                                      setSelectedSlotInline(null);
                                    }}
                                    className={cn(
                                      "rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all",
                                      darkCard
                                        ? isSelected
                                          ? "border-brand-primary bg-brand-primary text-white"
                                          : "border-white/30 text-white/90 hover:border-white/50"
                                        : isSelected
                                          ? "border-brand-primary bg-brand-primary/10 text-brand-dark"
                                          : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                                    )}
                                  >
                                    {r.displayName ?? `${r.durationHours} hr`}
                                  </button>
                                );
                              })}
                            </div>
                            {selectedDurationForModal == null && (
                              <p className={cn("mt-2 text-xs", darkCard ? "text-white/70" : "text-brand-muted")}>Select a duration to see available dates.</p>
                            )}
                          </div>
                        )}
                        {selectedDurationForModal != null && (
                          <>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <p className={cn("text-sm font-semibold", darkCard ? "text-white/90" : "text-brand-dark")}>Date</p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={goToToday}
                                  className={cn(
                                    "rounded-xl border px-3 py-2 text-sm font-medium transition-colors min-h-[44px] touch-manipulation",
                                    darkCard ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "border-brand-dark/15 bg-white text-brand-dark hover:bg-brand-bg"
                                  )}
                                >
                                  Today
                                </button>
                                <div className={cn("flex rounded-xl border p-0.5", darkCard ? "border-white/20 bg-white/10" : "border-brand-dark/10 bg-brand-bg/50")}>
                                  <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className={cn("rounded-lg p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoPrevMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Previous month">
                                    <ChevronLeft className="h-5 w-5" />
                                  </button>
                                  <span className={cn("min-w-[8rem] text-center text-sm font-semibold py-2", darkCard ? "text-white" : "text-brand-dark")}>{monthLabel}</span>
                                  <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className={cn("rounded-lg p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoNextMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Next month">
                                    <ChevronRight className="h-5 w-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            {soldOutFeedbackDate && (
                              <div className={cn("mt-2 rounded-lg border px-3 py-2 text-sm", darkCard ? "bg-amber-500/20 border-amber-400/40 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800")}>
                                <span className="font-medium">This date is sold out.</span>
                                {setSoldOutFeedbackDate && (
                                  <button type="button" onClick={() => setSoldOutFeedbackDate(null)} className="ml-2 underline hover:no-underline" aria-label="Dismiss">Dismiss</button>
                                )}
                              </div>
                            )}
                            <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 md:gap-2 min-w-0 w-full">
                              {WEEKDAY_LABELS.map((d) => (
                                <div key={d} className={cn("py-0.5 text-center text-[9px] sm:text-[10px] font-semibold uppercase", darkCard ? "text-white/70" : "text-brand-muted")}>
                                  {d}
                                </div>
                              ))}
                              {step2CompactGrid.map((cell, idx) => {
                                if (cell == null) {
                                  return <div key={`blank-${idx}`} className="min-h-[44px] min-w-[44px] sm:min-h-[48px]" />;
                                }
                                const { dateStr, label, weekday } = cell;
                                const isSelected = selectedDate === dateStr;
                                const isPast = dateStr < todayStr;
                                const openForDuration = openCountByDateForDuration.get(dateStr) ?? 0;
                                const entry = slotsByDate.get(dateStr);
                                const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                                const bookedCount3 = entry?.booked ?? 0;
                                const hasPriceForDay3 = typeof datePrices[dateStr] === "number";
                                const isAvailable3 = !isPast && (openForDuration > 0 || (slotsLength === 0 && hasPriceForDay3));
                                const priceCents = datePrices[dateStr];
                                const isHoliday = holidayDateStrings.has(dateStr);
                                const slotData3 = isTicketed ? slotDataByDate.get(dateStr) : undefined;
                                const isCharterLocked3 = slotData3?.isCharterLocked ?? false;
                                const spotsLeft3 = slotData3 ? (slotData3.spotsRemaining ?? null) : null;
                                const spotsBooked3 = slotData3?.spotsBooked ?? null;
                                const isSoldOutShared3 = isTicketed && bookingMode === "shared" && spotsLeft3 === 0 && !isCharterLocked3;
                                const isFullyUnavailable3 = isTicketed && isCharterLocked3;
                                const ticketsAvail3 = ticketsAvailableByDate?.[dateStr];
                                const isFullyBooked3 = !isPast && (isTicketed ? (spotsLeft3 === 0 && slotData3 != null || (typeof ticketsAvail3 === "number" && ticketsAvail3 === 0)) : (entry != null && openForDuration === 0));
                                const openForDate3 = entry?.open ?? 0;
                                const soldOutNoSlots3 = onOpenInModal != null && isTicketed && openForDate3 === 0;
                                const hasBookingsUrgency3 = !isPast && (isTicketed ? (spotsBooked3 ?? 0) > 0 && spotsLeft3 !== 0 : (openForDuration > 0 || (slotsLength === 0 && hasPriceForDay3)) && bookedCount3 > 0 && !isFullyBooked3);
                                const hasBookingsOnDate3 = isTicketed && !isPast && (spotsBooked3 ?? 0) > 0;
                                const displayBookedCount3 = isTicketed ? (spotsBooked3 ?? 0) : bookedCount3;
                                return (
                                  <button
                                    key={dateStr}
                                    type="button"
                                    disabled={isPast || !isAvailable3 || isFullyUnavailable3 || soldOutNoSlots3}
                                    onClick={() => ((onOpenInModal != null && isTicketed ? isAvailable3 : (isAvailable3 || isSoldOutShared3)) && handleDayClick(dateStr))}
                                    title={isHoliday ? "Holiday pricing" : (hasBookingsUrgency3 || hasBookingsOnDate3) ? `${displayBookedCount3} already booked this day` : undefined}
                                    className={cn(
                                      "rounded-lg sm:rounded-xl border-2 min-h-[44px] min-w-[44px] sm:min-h-[58px] p-0.5 text-center transition-all flex flex-col justify-center gap-0 min-w-0 w-full touch-manipulation",
                                      isHoliday && !isPast && "ring-1.5 ring-violet-400/80",
                                      darkCard && isHoliday && !isPast && "bg-violet-500/15 border-violet-400/40",
                                      !darkCard && isHoliday && !isPast && "bg-violet-50/90 border-violet-300/60",
                                      darkCard
                                        ? cn(
                                            isPast && "opacity-60 cursor-not-allowed border-white/20 text-white/50",
                                            !isPast && !isAvailable3 && !isFullyBooked3 && !isSoldOutShared3 && "border-white/20 text-white/50 bg-white/5 cursor-not-allowed",
                                            isFullyBooked3 && "bg-red-500/20 text-red-200 border-red-400/50 cursor-not-allowed",
                                            isSoldOutShared3 && "bg-amber-500/20 text-amber-200 border-amber-400/40 cursor-pointer",
                                            (hasBookingsUrgency3 || hasBookingsOnDate3) && "bg-amber-500/25 text-amber-200 border-amber-400/50",
                                            isAvailable3 && !isSoldOutShared3 && !hasBookingsUrgency3 && !hasBookingsOnDate3 && !isFullyBooked3 && !isHoliday && "bg-emerald-500/30 text-white border-emerald-400/60 hover:bg-emerald-500/45 hover:border-emerald-400",
                                            isAvailable3 && !isSoldOutShared3 && isHoliday && !hasBookingsUrgency3 && !hasBookingsOnDate3 && !isFullyBooked3 && "text-white border-violet-400/60 hover:bg-violet-500/25",
                                            isSelected && "border-brand-primary bg-brand-primary/50 text-white font-semibold ring-2 ring-brand-primary/60"
                                          )
                                        : cn(
                                            isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                                            !isPast && !isAvailable3 && !isFullyBooked3 && !isSoldOutShared3 && "bg-brand-dark/10 text-brand-muted border-brand-dark/15 cursor-not-allowed",
                                            isFullyBooked3 && "bg-red-100/95 text-red-900 border-red-400/60 cursor-not-allowed",
                                            isSoldOutShared3 && "bg-amber-50 text-amber-800 border-amber-300 cursor-pointer",
                                            (hasBookingsUrgency3 || hasBookingsOnDate3) && !isHoliday && "bg-amber-50/95 text-amber-900 border-amber-400/50",
                                            (hasBookingsUrgency3 || hasBookingsOnDate3) && isHoliday && "bg-amber-50/90 border-amber-400/50 text-amber-900",
                                            isAvailable3 && !isSoldOutShared3 && !hasBookingsUrgency3 && !hasBookingsOnDate3 && !isFullyBooked3 && !isHoliday && "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60 active:scale-[0.98]",
                                            isAvailable3 && isHoliday && !hasBookingsUrgency3 && !hasBookingsOnDate3 && !isFullyBooked3 && "text-violet-900 border-violet-400/60 hover:bg-violet-100 active:scale-[0.98]",
                                            isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-2 ring-brand-primary/40"
                                          )
                                    )}
                                  >
                                    <span className={cn("block text-[8px] sm:text-[10px] uppercase leading-tight truncate", darkCard ? "text-white/70" : "text-brand-muted")}>{weekday}</span>
                                    <span className={cn("block font-semibold text-[9px] sm:text-[10px] leading-tight truncate", darkCard && (isAvailable3 || isSelected) ? "text-white" : darkCard ? "text-white/80" : "")}>{label.split(" ")[1] ?? label}</span>
                                    {isTicketed && isFullyUnavailable3 && (
                                      <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-white/60" : "text-brand-muted")}>Unavailable</span>
                                    )}
                                    {isTicketed && !isFullyUnavailable3 && isSoldOutShared3 && (
                                      <>
                                        <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-amber-200" : "text-amber-700")}>Sold out</span>
                                        <span className={cn("block text-[7px] sm:text-[8px] leading-tight truncate", darkCard ? "text-amber-300/80" : "text-amber-600/80")}>Charter avail.</span>
                                      </>
                                    )}
                                    {(hasBookingsUrgency3 || hasBookingsOnDate3) && (
                                      <span className={cn("block text-[8px] sm:text-[10px] font-semibold leading-tight truncate mt-0.5", darkCard ? "text-amber-200" : "text-amber-700")}>{displayBookedCount3} booked</span>
                                    )}
                                    {isTicketed && !isFullyUnavailable3 && showSpotsRemaining && spotsLeft3 !== null && spotsLeft3 > 0 && isAvailable3 && !hasBookingsUrgency3 && !hasBookingsOnDate3 && (
                                      <span className={cn("block text-[8px] sm:text-[9px] font-bold leading-tight truncate", darkCard ? "text-amber-200" : "text-amber-700")}>{spotsLeft3} left</span>
                                    )}
                                    {isTicketed && !isFullyUnavailable3 && isAvailable3 && !isSoldOutShared3 && !hasBookingsUrgency3 && !hasBookingsOnDate3 && !(showSpotsRemaining && spotsLeft3 !== null && spotsLeft3 > 0) && (() => {
                                      if (typeof priceCents === "number") {
                                        return <span className={cn("block text-[10px] sm:text-xs font-bold leading-tight truncate", darkCard ? "text-emerald-200" : isSelected ? "text-brand-primary" : "text-emerald-800")}>${(priceCents / 100).toFixed(0)}/ea</span>;
                                      }
                                      return <span className={cn("block text-[8px] sm:text-[9px] font-semibold leading-tight truncate", darkCard ? "text-emerald-200" : "text-emerald-800")}>Open</span>;
                                    })()}
                                    {!isTicketed && typeof priceCents === "number" && isAvailable3 && (
                                      <span className={cn("block text-[10px] sm:text-xs font-bold leading-tight truncate", darkCard ? "text-emerald-200" : isSelected ? "text-brand-primary" : "text-emerald-800")}>
                                        ${(priceCents / 100).toFixed(0)}
                                      </span>
                                    )}
                                    {isFullyBooked3 && <span className={cn("block text-[8px] sm:text-[10px] font-semibold leading-tight truncate mt-0.5", darkCard ? "text-red-200" : "text-red-700")}>Full</span>}
                                  </button>
                                );
                              })}
                            </div>
                            {selectedDate && (
                              <div className="pt-3 border-t border-brand-dark/10">
                                <p className={cn("text-sm font-semibold mb-2", darkCard ? "text-white/90" : "text-brand-dark")}>Time</p>
                                {loading ? (
                                  <div className={cn("flex items-center gap-2 py-3", darkCard ? "text-white/80" : "text-brand-muted")}>
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                                    <span className="text-xs">Checking availability…</span>
                                  </div>
                                ) : timeOptionsForModal.length === 0 ? (
                                  <p className={cn("text-xs", darkCard ? "text-white/70" : "text-brand-muted")}>No open slots this day for the selected duration.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {timeOptionsForModal.map(({ timeLabel, slot }) => {
                                      const isSelected = selectedSlotInline?.id === slot.id;
                                      return (
                                        <button
                                          key={slot.id}
                                          type="button"
                                          onClick={() => setSelectedSlotInline(slot)}
                                          className={cn(
                                            "rounded-lg border-2 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all min-h-[44px] touch-manipulation w-full sm:w-auto",
                                            darkCard
                                              ? isSelected
                                                ? "border-brand-primary bg-brand-primary text-white"
                                                : "border-white/30 text-white/90 hover:border-white/50"
                                              : isSelected
                                                ? "border-brand-primary bg-brand-primary/10 text-brand-dark"
                                                : "border-brand-dark/15 hover:border-brand-dark/30"
                                          )}
                                        >
                                          {timeLabel}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-4 pt-4 border-t border-brand-dark/10">
                              <button
                                type="button"
                                disabled={loading || !selectedDate || !selectedSlotInline}
                                onClick={() => {
                                  if (!selectedDate || !selectedSlotInline) return;
                                  setShowInlineBoatStep(true);
                                }}
                                className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                              >
                                Continue to choose your boat
                              </button>
                              <p className={cn("text-center text-xs mt-2", darkCard ? "text-white/70" : "text-brand-muted")}>Pick your boat below, then continue to checkout</p>
                            </div>
                            {noAvailabilityBecauseNotSetUp && (
                              <div className={cn("mt-6 rounded-2xl border px-4 py-4 text-center text-sm", darkCard ? "border-white/20 bg-white/5 text-white/80" : "border-brand-dark/10 bg-brand-bg/50 text-brand-muted")}>
                                <p className={darkCard ? "text-white font-medium" : "font-medium text-brand-dark"}>Calendar not loading from Firestore.</p>
                                <p className="mt-1">Check Firebase config and run setup in <a href="/admin" className="text-brand-primary underline">/admin</a>.</p>
                              </div>
                            )}
                            {monthFetchErrorForKey && (
                              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4 text-center text-sm text-red-800">
                                <p className="font-medium">Could not load availability for this month.</p>
                                {onRetryMonthFetch && (
                                  <button type="button" onClick={onRetryMonthFetch} className="mt-2 font-medium underline hover:no-underline">
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                            {!monthFetchErrorForKey && didFetchSlots && !loading && !hasAnyAvailability && !noAvailabilityBecauseNotSetUp && (
                              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-center text-sm text-amber-800">
                                <p className="font-medium">No availability for the dates shown. Try another month or call us.</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Panel 2: Choose your boat */}
                  <div
                    ref={panel2Ref as React.RefObject<HTMLDivElement>}
                    className={cn("flex flex-col flex-shrink-0 sm:pl-2 min-w-0 sm:max-h-[400px] w-full", hasInlineDetails ? "sm:w-1/3" : "sm:w-1/2")}
                  >
                    {selectedDate && selectedSlotInline ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-0.5 shrink-0">
                          <h3 className={cn("text-xs sm:text-sm font-bold tracking-tight", darkCard ? "text-white" : "text-brand-dark")}>Choose your boat</h3>
                          <button
                            type="button"
                            onClick={() => { setShowInlineBoatStep(false); setSelectedBoatInline(null); }}
                            className={cn("text-xs font-medium whitespace-nowrap", darkCard ? "text-white/80 hover:text-white" : "text-brand-muted hover:text-brand-primary")}
                          >
                            Change date or time
                          </button>
                        </div>
                        <p className={cn("text-[10px] sm:text-[11px] mb-1.5 shrink-0", darkCard ? "text-white/70" : "text-brand-muted")}>
                          {selectedDate} · {formatTime(selectedSlotInline.startAt)}
                        </p>
                        {!inlineBoatsLoading && inlineBoats.length > 0 && availableBoatIdsForInlineSlot.size === 0 ? (
                          <div className={cn("rounded-lg border p-3 mb-2 shrink-0", darkCard ? "bg-amber-500/20 border-amber-400/50 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-900")}>
                            <p className="text-xs font-medium">This time is no longer available.</p>
                            <p className="text-[10px] mt-0.5 opacity-90">It may have just been booked. Use &quot;Change date or time&quot; above to pick another slot.</p>
                          </div>
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          {inlineBoatsLoading ? (
                            <div className="py-4 flex justify-center">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                            </div>
                          ) : inlineBoats.length === 0 ? (
                            <p className={cn("text-xs py-2", darkCard ? "text-white/70" : "text-brand-muted")}>No boats assigned — continue to details.</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-1.5 mb-2">
                                {inlineBoats.slice(0, 6).map((boat) => {
                                  const isAvailable = availableBoatIdsForInlineSlot.has(boat.id) && !unavailableBoatIdsForInlineSlot.has(boat.id);
                                  const isBooked = bookedBoatIdsForInlineSlot.has(boat.id);
                                  const isSelected = selectedBoatInline?.id === boat.id;
                                  const thumb = boat.photos?.[0];
                                  return (
                                    <button
                                      key={boat.id}
                                      type="button"
                                      disabled={!isAvailable}
                                      onClick={() => isAvailable && setSelectedBoatInline(boat)}
                                      className={cn(
                                        "relative flex flex-col overflow-hidden rounded-md border-2 text-left transition-all min-h-0",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                                        isSelected ? "border-brand-primary bg-brand-primary ring-2 ring-brand-primary/30" : "border-brand-dark/15 bg-white hover:border-brand-dark/30",
                                        !isAvailable && "cursor-not-allowed opacity-70",
                                        isBooked && "border-brand-dark/25 bg-brand-dark/5"
                                      )}
                                    >
                                      <div className="relative w-full aspect-[4/3] bg-brand-dark/10 shrink-0 overflow-hidden rounded-t">
                                        {thumb ? (
                                          <Image src={getDisplayImageUrl(thumb)} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                                        ) : (
                                          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                                        )}
                                      </div>
                                      {isBooked && (
                                        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-500/70 z-10 pointer-events-none" aria-hidden>
                                          <span className="text-xs font-bold text-white uppercase tracking-wide px-2.5 py-1.5 rounded-lg bg-slate-800/90 border border-white/20">Booked</span>
                                        </div>
                                      )}
                                      <div className={cn("px-1.5 py-1 min-w-0", isBooked && "relative z-0")}>
                                        <span className={cn("text-[10px] sm:text-[11px] font-semibold truncate block leading-tight", isSelected ? "text-white" : isAvailable ? "text-brand-dark" : "text-brand-muted")}>{boat.name}{isBooked ? " (Booked)" : ""}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              {inlineBoats.length > 6 && (
                                <div className="mb-2">
                                  <label htmlFor="inline-other-boats" className="sr-only">Other boats</label>
                                  <select
                                    id="inline-other-boats"
                                    value={selectedBoatInline && inlineBoats.findIndex((b) => b.id === selectedBoatInline.id) >= 6 ? selectedBoatInline.id : ""}
                                    onChange={(e) => {
                                      const id = e.target.value;
                                      if (id) {
                                        const boat = inlineBoats.find((b) => b.id === id);
                                        if (boat) setSelectedBoatInline(boat);
                                      }
                                    }}
                                    className="w-full rounded-md border-2 border-brand-dark/15 bg-white px-2 py-1.5 text-[11px] font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
                                  >
                                    <option value="">Other boats ({inlineBoats.length - 6})</option>
                                    {inlineBoats.slice(6).map((boat) => {
                                      const isAvailable = availableBoatIdsForInlineSlot.has(boat.id) && !unavailableBoatIdsForInlineSlot.has(boat.id);
                                      const isBooked = bookedBoatIdsForInlineSlot.has(boat.id);
                                      return (
                                        <option key={boat.id} value={boat.id} disabled={!isAvailable}>
                                          {boat.name}{isBooked ? " (Booked)" : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0 mt-1">
                          <button
                            type="button"
                            disabled={inlineBoatsLoading || (inlineBoats.length > 0 && !selectedBoatInline)}
                            onClick={() => {
                              if (!selectedDate || !selectedSlotInline) return;
                              const boatId = selectedBoatInline?.id ?? (selectedSlotInline as { boatId?: string }).boatId;
                              if (experienceForDetails && ratesForDetails && addonsForDetails) {
                                setShowDetailsStep(true);
                              } else if (onOpenInModal) {
                                onOpenInModal({
                                  experienceId: experienceId ?? undefined,
                                  experienceSlug: experienceSlug ?? undefined,
                                  date: selectedDate,
                                  slotId: selectedSlotInline.id,
                                  boatId: boatId ?? undefined,
                                });
                              }
                            }}
                            className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 text-sm hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Continue to checkout
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowInlineBoatStep(false); setSelectedBoatInline(null); }}
                            className={cn("w-full rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-colors", darkCard ? "border-white/40 text-white hover:bg-white/20" : "border-brand-dark/15 text-brand-dark hover:bg-brand-bg")}
                          >
                            Change date or time
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className={cn("text-sm py-4", darkCard ? "text-white/80" : "text-brand-muted")}>Select date and time first.</p>
                    )}
                  </div>
                  {hasInlineDetails && (
                    <div ref={panel3Ref as React.RefObject<HTMLDivElement>} className="w-full sm:w-1/3 flex-shrink-0 sm:pl-2 min-w-0 flex flex-col">
                      {selectedDate && selectedSlotInline && experienceForDetails && (
                        !inlineDetailsStepReady ? (
                          <p className={cn("text-sm py-4", darkCard ? "text-white/80" : "text-brand-muted")}>Loading…</p>
                        ) : (
                          <InlineBookingDetailsStep
                            experienceId={experienceForDetails.id}
                            experienceTitle={experienceForDetails.title}
                            experienceMaxGuests={experienceForDetails.maxGuests}
                            experiencePetsMax={experienceForDetails.petsMax}
                            allowDeposit={experienceForDetails.allowDeposit}
                            allowTipNow={experienceForDetails.allowTipNow}
                            allowTipLater={experienceForDetails.allowTipLater}
                            boatId={selectedBoatInline?.id}
                            boatName={selectedBoatInline?.name}
                            slot={{ id: selectedSlotInline.id, startAt: selectedSlotInline.startAt, endAt: selectedSlotInline.endAt }}
                            rateId={inlineDetailsRate!.id}
                            rateDisplayName={inlineDetailsRate!.displayName ?? `${inlineDetailsRate!.durationHours} hr`}
                            rateDurationHours={inlineDetailsRate!.durationHours}
                            selectedDate={selectedDate}
                            addons={addonsForDetails ?? []}
                            onBack={() => setShowDetailsStep(false)}
                            onSuccess={() => {
                              setShowDetailsStep(false);
                              setShowInlineBoatStep(false);
                              goToInlineStep?.(0);
                            }}
                            bookingMode={bookingMode}
                            spotsRemaining={selectedDate ? slotDataByDate.get(selectedDate)?.spotsRemaining : undefined}
                          />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) ) : (
              <>
                <h2
                  id="calendar-section-heading"
                  className={cn("text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight", darkCard ? "text-white" : "text-brand-dark")}
                >
                  Choose your date
                </h2>
                <p className={cn("mt-1.5 sm:mt-2 text-xs sm:text-sm", darkCard ? "text-white/80" : "text-brand-muted")}>
                  Tap a date to pick a time and continue to checkout.
                </p>
                {loading ? (
                  <div className="mt-4 sm:mt-6 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={cn("h-9 sm:h-10 w-20 sm:w-24 animate-pulse rounded-lg sm:rounded-xl", darkCard ? "bg-white/20" : "bg-brand-dark/10")} aria-hidden />
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 lg:gap-4">
                      {WEEKDAY_LABELS.map((label, i) => (
                        <div key={`weekday-${i}`} className={cn("py-0.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold uppercase", darkCard ? "text-white/50" : "text-brand-muted/50")}>
                          {label}
                        </div>
                      ))}
                      {Array.from({ length: 35 }, (_, i) => (
                        <div key={i} className={cn("min-h-[44px] sm:min-h-[88px] lg:min-h-[120px] xl:min-h-[140px] animate-pulse rounded-lg sm:rounded-xl", darkCard ? "bg-white/20" : "bg-brand-dark/10")} aria-hidden />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-between gap-4">
                      <h2 className={cn("text-2xl font-bold", darkCard ? "text-white" : "text-brand-dark")}>{monthLabel}</h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                            setSelectedDate(todayStr);
                          }}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-sm font-medium transition-colors min-h-[44px] touch-manipulation",
                            darkCard ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "border-brand-dark/15 bg-white text-brand-dark hover:bg-brand-bg"
                          )}
                        >
                          Today
                        </button>
                        <div className={cn("flex rounded-xl border p-0.5", darkCard ? "border-white/20 bg-white/10" : "border-brand-dark/10 bg-brand-bg/50")}>
                          <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className={cn("rounded-lg p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoPrevMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Previous month">
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className={cn("rounded-lg p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation", !canGoNextMonth && "opacity-40 cursor-not-allowed", darkCard ? "text-white/80 hover:bg-white/20" : "text-brand-muted hover:bg-white hover:text-brand-dark")} aria-label="Next month">
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 sm:mt-4 flex-1 grid grid-cols-7 gap-px sm:gap-1 min-h-[320px] sm:min-h-[400px] lg:min-h-[480px] bg-brand-dark/10 rounded-xl overflow-hidden border border-brand-dark/10 bg-white shadow-soft">
                      {WEEKDAY_LABELS.map((d) => (
                        <div key={d} className="py-2 px-1 text-center text-xs font-semibold uppercase text-brand-muted bg-brand-bg/50 sm:text-sm">
                          {d}
                        </div>
                      ))}
                      {calendarDays.map((cell) => {
                        const isSelected = selectedDate === cell.dateStr;
                        const hasOpen = cell.openCount > 0;
                        const hasBooked = cell.bookedCount > 0;
                        const isPast = cell.isPast;
                        const isHoliday = holidayDateStrings.has(cell.dateStr);
                        const isClickable = cell.isCurrentMonth && !isPast && (cell.seasonalAllowed !== false) && (onOpenInModal != null && isTicketed ? hasOpen : (hasOpen || hasBooked));
                        return (
                          <button
                            key={cell.dateStr + cell.day}
                            type="button"
                            disabled={!isClickable}
                            onClick={() => isClickable && handleDayClick(cell.dateStr)}
                            title={isHoliday ? "Holiday pricing" : undefined}
                            className={cn(
                              "flex flex-col items-stretch text-left p-1.5 sm:p-2 min-h-[64px] sm:min-h-[80px] lg:min-h-[100px] overflow-hidden rounded-lg transition-all",
                              !cell.isCurrentMonth && "text-brand-muted/50",
                              cell.isCurrentMonth && isPast && "text-brand-muted/60",
                              isClickable && "cursor-pointer hover:ring-2 hover:ring-brand-primary/30",
                              isSelected && "ring-2 ring-brand-primary ring-offset-1 bg-brand-primary/10",
                              isHoliday && cell.isCurrentMonth && !isPast && "ring-1.5 ring-violet-400/80 bg-violet-50/90 border border-violet-200/60",
                              hasBooked && cell.isCurrentMonth && !isPast && "bg-amber-100/90 hover:bg-amber-100 text-amber-900 border border-amber-200/60",
                              hasOpen && !hasBooked && cell.isCurrentMonth && !isPast && !isHoliday && "bg-green-50/80 hover:bg-green-100 text-green-900",
                              hasOpen && !hasBooked && cell.isCurrentMonth && !isPast && isHoliday && "hover:bg-violet-100/80 text-violet-900"
                            )}
                          >
                            <span className="text-sm font-semibold sm:text-base shrink-0">{cell.day}</span>
                            <div className="flex-1 min-h-0 mt-1 overflow-y-auto space-y-0.5">
                              {cell.openSlots.slice(0, 4).map((slot) => (
                                <div key={slot.id} className="text-[10px] sm:text-xs font-medium text-green-800 bg-green-200/60 rounded px-1 py-0.5 truncate" title={formatTime(slot.startAt)}>
                                  {formatTime(slot.startAt)}
                                </div>
                              ))}
                              {cell.openSlots.length > 4 && <div className="text-[10px] text-brand-muted">+{cell.openSlots.length - 4} more</div>}
                              {cell.isCurrentMonth && !cell.isPast && cell.openSlots.length === 0 && cell.bookedCount > 0 && <div className="text-[10px] text-brand-muted">Booked</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-brand-muted">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-green-200 border border-green-300" aria-hidden />
                        Available (times in day)
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-violet-100 border border-violet-300" aria-hidden />
                        Holiday pricing
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-amber-200 border border-amber-300" aria-hidden />
                        Has bookings
                      </span>
                    </div>
                    {noAvailabilityBecauseNotSetUp && (
                      <div className="mt-6 rounded-2xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-4 text-center text-sm text-brand-muted">
                        <p className="font-medium text-brand-dark">Calendar not loading from Firestore.</p>
                        <p className="mt-1">Yes—we use Firestore for the calendar. With no bookings, every date is open. Right now the app couldn&apos;t load this experience, so the calendar can&apos;t show those open dates.</p>
                        <p className="mt-2 text-brand-dark font-medium">Check:</p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-left max-w-md mx-auto">
                          <li>Firebase is configured in <code className="rounded bg-brand-dark/10 px-1 py-0.5 text-xs">.env.local</code> (see <code className="rounded bg-brand-dark/10 px-1 py-0.5 text-xs">docs/BOOKING_SETUP.md</code>)</li>
                          <li>Experiences are seeded: open <a href="/admin" className="font-medium text-brand-primary underline hover:no-underline">/admin</a> and click <strong className="text-brand-dark">Run setup</strong></li>
                        </ul>
                        <p className="mt-2 text-brand-muted/90">After that, this calendar will show 100% open dates until someone books.</p>
                      </div>
                    )}
                    {monthFetchErrorForKey && (
                      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4 text-center text-sm text-red-800">
                        <p className="font-medium">Could not load availability for this month.</p>
                        {onRetryMonthFetch && (
                          <button type="button" onClick={onRetryMonthFetch} className="mt-2 font-medium underline hover:no-underline">
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                    {!monthFetchErrorForKey && didFetchSlots && !loading && !hasAnyAvailability && !noAvailabilityBecauseNotSetUp && (
                      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-center text-sm text-amber-800">
                        <p className="font-medium">No availability for the dates shown.</p>
                        <p className="mt-1 text-amber-700/90">Try another month or call us to request a date.</p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {!onOpenInModal && (
      <Dialog
        open={slotModalOpen && !!selectedDate}
        onOpenChange={(open) => {
          if (!open) setSlotModalOpen(false);
        }}
        title={selectedDate ? `Pick a time · ${selectedDateLabel}` : "Choose a time"}
        description="Select a duration, then a start time. Price shown per option."
        className="max-w-md w-[calc(100vw-2rem)] sm:w-full"
      >
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {directCheckoutError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
              <span>{directCheckoutError}</span>
              <button type="button" onClick={() => setDirectCheckoutError(null)} className="text-red-600 underline text-xs">Dismiss</button>
            </div>
          )}
          {directCheckout && (
            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5">Discount code (optional)</label>
              <input
                type="text"
                value={directDiscountCode}
                onChange={(e) => setDirectDiscountCode(e.target.value)}
                placeholder="e.g. SAVE20"
                className="w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none"
              />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Duration</p>
            <div className="flex flex-wrap gap-1.5">
              {[...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => {
                const isSelected = selectedDurationForModal === r.durationHours;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedDurationForModal(r.durationHours)}
                    className={cn(
                      "rounded-lg border-2 px-2.5 py-1.5 text-xs font-medium transition-all min-h-[44px] touch-manipulation",
                      isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                    )}
                  >
                    {r.displayName ?? `${r.durationHours} hr`}
                  </button>
                );
              })}
            </div>
            {selectedDurationForModal == null && <p className="mt-2 text-xs text-brand-muted">Select a duration to see available times.</p>}
          </div>
          {selectedDurationForModal != null && (
            <div>
              <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Time</p>
              {timeOptionsForModal.length === 0 ? (
                <p className="text-xs text-brand-muted">No open slots for this duration on this day.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  {timeOptionsForModal.map(({ timeLabel, slot }) => {
                    const rate = rates.find((r) => r.durationHours === selectedDurationForModal);
                    const priceLabel = rate ? formatPrice(rate.priceCents) : null;
                    const useOpenInModal = !!onOpenInModal && !!selectedDate;
                    const requiresFullFlow = isTicketed || pricingType === "shared";
                    const useDirectCheckout = !useOpenInModal && directCheckout && !requiresFullFlow;
                    const checkoutHref =
                      !useOpenInModal && !useDirectCheckout && bookHref && selectedDate
                        ? `${bookHref}?date=${encodeURIComponent(selectedDate)}&slotId=${encodeURIComponent(slot.id)}`
                        : null;
                    const isDirectLoading = directCheckoutLoading === slot.id;
                    const btnClass = cn(
                      "rounded-lg border-2 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all flex flex-col items-center justify-center min-h-[52px]",
                      "border-brand-dark/15 hover:border-brand-dark/30"
                    );
                    if (onOpenInModal && selectedDate) {
                      const openModal = onOpenInModal as OnOpenInModalFn;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            openModal({
                              experienceId: experienceId ?? undefined,
                              experienceSlug: experienceSlug ?? undefined,
                              date: selectedDate,
                              slotId: slot.id,
                              boatId: (slot as { boatId?: string }).boatId,
                            });
                            setSlotModalOpen(false);
                          }}
                          className={btnClass}
                        >
                          <span>{timeLabel}</span>
                          {priceLabel && <span className="text-[10px] md:text-xs font-semibold text-brand-primary mt-0.5">{priceLabel}</span>}
                        </button>
                      );
                    }
                    if (useDirectCheckout) {
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!experienceId || !!directCheckoutLoading}
                          onClick={async () => {
                            if (!experienceId || directCheckoutLoading) return;
                            setDirectCheckoutError(null);
                            setDirectCheckoutLoading(slot.id);
                            try {
                              const res = await fetch("/api/booking/create-checkout-session-direct", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  experienceId,
                                  slotId: slot.id,
                                  ...(slot.boatId && { boatId: slot.boatId }),
                                  partySize: 1,
                                  petsCount: 0,
                                  ...(directDiscountCode.trim() && { discountCode: directDiscountCode.trim() }),
                                }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (data?.ticketedFlowRequired && data?.bookingUrl) {
                                setSlotModalOpen(false);
                                if (onOpenInModal) {
                                  const openModal = onOpenInModal as OnOpenInModalFn;
                                  openModal({
                                    experienceId: experienceId ?? undefined,
                                    experienceSlug: experienceSlug ?? undefined,
                                    date: selectedDate ?? "",
                                    slotId: slot.id,
                                    boatId: (slot as { boatId?: string }).boatId,
                                  });
                                } else {
                                  window.location.href = data.bookingUrl;
                                }
                                return;
                              }
                              if (res.ok && data?.url) {
                                setSlotModalOpen(false);
                                window.location.href = data.url;
                                return;
                              }
                              const msg = (data as { error?: string }).error ?? "Checkout failed";
                              setDirectCheckoutError(msg);
                            } finally {
                              setDirectCheckoutLoading(null);
                            }
                          }}
                          className={cn(btnClass, "disabled:opacity-60 disabled:pointer-events-none")}
                        >
                          {isDirectLoading ? "…" : (<><span>{timeLabel}</span>{priceLabel && <span className="text-[10px] md:text-xs font-semibold text-brand-primary mt-0.5">{priceLabel}</span>}</>)}
                        </button>
                      );
                    }
                    return checkoutHref ? (
                      <Link key={slot.id} href={checkoutHref} onClick={() => setSlotModalOpen(false)} className={btnClass}>
                        <span>{timeLabel}</span>
                        {priceLabel && <span className="text-[10px] md:text-xs font-semibold text-brand-primary mt-0.5">{priceLabel}</span>}
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>
      )}
    </>
  );
}
