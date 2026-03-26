"use client";

import type { Dispatch, SetStateAction } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSeasonalAllowed } from "@/lib/booking/experience-slots";
import { isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { isWatersportsSlug } from "@/lib/booking/experience-aliases";
import { slotTimeSortKey } from "@/lib/booking/booking-calendar-utils";
import { WEEKDAY_LABELS } from "@/components/site/booking-modal-steps/booking-calendar-constants";
import type { ExperienceItem, BoatOption, SlotDto, RateOption } from "@/lib/booking/booking-modal-types";
import type { BookingModalInitialSelection } from "@/components/site/BookingModalContext";
import type { SlotDayCounts } from "@/lib/booking/aggregate-slots-by-date";
import type { SlotLikeForCalendar } from "@/lib/booking/partial-slots-calendar-derivation";

type Step3Cell = { dateStr: string; label: string; weekday: string } | null;

export type BookingStep2CalendarProps = {
  step: 1 | 2 | 3 | 4;
  initialSelection?: BookingModalInitialSelection | null;
  selectedExperience: ExperienceItem | null;
  loading: boolean;
  experiencesLoadError: string | null;
  isTicketed: boolean;
  boatsLoading: boolean;
  ratesLoadError: string | null;
  experienceDetailLoadError: string | null;
  retryBoats: () => void;
  ratesForSelection: RateOption[];
  selectedRateIdForCalendar: string | null;
  selectCharterCalendarRate: (rateId: string) => void;
  isViewMonthCurrent: boolean;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  viewMonthMonth: number;
  viewMonthYear: number;
  setViewMonthYear: Dispatch<SetStateAction<number>>;
  setViewMonthMonth: Dispatch<SetStateAction<number>>;
  viewMonthLabel: string;
  slotsLoadError: string | null;
  monthSlots: SlotLikeForCalendar[];
  slotsLoading: boolean;
  slotsPartialData: boolean;
  selectedDate: string | null;
  selectedDateVerifiedInPartial: boolean;
  retrySlots: () => void;
  datePricesRateMismatchMessage: string | null;
  multiBoatListing: boolean;
  calendarRenderKey: number | string;
  step3CalendarGrid: Step3Cell[];
  chicagoTodayStr: string;
  slotsByDate: Map<string, SlotDayCounts>;
  rateForCalendar: RateOption | null;
  openCountByDateAndDuration: Map<string, Map<number, number>>;
  ticketsAvailableByDate: Record<string, number>;
  ticketsBookedByDate: Record<string, number>;
  datePrices: Record<string, number>;
  holidayDateStrings: Set<string>;
  holdDataMissingByDate: Set<string>;
  datePricesLoading: boolean;
  setSelectedDate: (d: string) => void;
  setSelectedSlot: Dispatch<SetStateAction<SlotDto | null>>;
  departureTimeLabel: string | null;
  openSlotsForDate: SlotLikeForCalendar[];
  ticketCountsLoading: boolean;
  ticketCounts: {
    total: number;
    sold: number;
    onHold: number;
    available: number;
    conservativeEstimate?: boolean;
    availabilityNote?: string;
  } | null;
  datePricesPartialData: boolean;
  ticketCountsError: string | null;
  retryTicketCounts: () => void;
  openSlotsByTime: (SlotLikeForCalendar & { timeLabel: string })[];
  selectedSlot: SlotDto | null;
  wakeCharterBoatIdsForStep2: Set<string> | null;
  selectedBoat: BoatOption | null;
  noRateForSelectedSlot: boolean;
};

export function BookingStep2Calendar({
  step,
  initialSelection,
  selectedExperience,
  loading,
  experiencesLoadError,
  isTicketed,
  boatsLoading,
  ratesLoadError,
  experienceDetailLoadError,
  retryBoats,
  ratesForSelection,
  selectedRateIdForCalendar,
  selectCharterCalendarRate,
  isViewMonthCurrent,
  canGoPrevMonth,
  canGoNextMonth,
  viewMonthMonth,
  viewMonthYear,
  setViewMonthYear,
  setViewMonthMonth,
  viewMonthLabel,
  slotsLoadError,
  monthSlots,
  slotsLoading,
  slotsPartialData,
  selectedDate,
  selectedDateVerifiedInPartial,
  retrySlots,
  datePricesRateMismatchMessage,
  multiBoatListing,
  calendarRenderKey,
  step3CalendarGrid,
  chicagoTodayStr,
  slotsByDate,
  rateForCalendar,
  openCountByDateAndDuration,
  ticketsAvailableByDate,
  ticketsBookedByDate,
  datePrices,
  holidayDateStrings,
  holdDataMissingByDate,
  datePricesLoading,
  setSelectedDate,
  setSelectedSlot,
  departureTimeLabel,
  openSlotsForDate,
  ticketCountsLoading,
  ticketCounts,
  datePricesPartialData,
  ticketCountsError,
  retryTicketCounts,
  openSlotsByTime,
  selectedSlot,
  wakeCharterBoatIdsForStep2,
  selectedBoat,
  noRateForSelectedSlot,
}: BookingStep2CalendarProps) {
  return (
              <div className="space-y-2 sm:space-y-3 md:space-y-4 min-w-0">
                {/* When opened with a pre-selected experience but list failed or didn't match, show why the calendar never loads */}
                {step === 2 && initialSelection && !selectedExperience && !loading && (
                  <p className="text-sm text-amber-700 py-3 px-2">
                    {experiencesLoadError
                      ? `${experiencesLoadError} Please try again or contact us.`
                      : "Couldn’t load this experience. Please select one from the list on the left."}
                  </p>
                )}
                {step === 2 && initialSelection && !selectedExperience && loading && (
                  <div className="flex min-h-[min(48dvh,380px)] flex-col items-center justify-center gap-3 py-8">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                    <p className="text-sm text-brand-muted text-center">Loading experience…</p>
                  </div>
                )}
                {step === 2 && isTicketed && boatsLoading && selectedExperience && (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                    <span className="text-sm text-brand-muted">Loading departure times…</span>
                  </div>
                )}
                {ratesLoadError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 mb-2 text-sm text-amber-950">
                    <p>{ratesLoadError} Try again or contact us.</p>
                    <button
                      type="button"
                      onClick={() => retryBoats()}
                      className="mt-2 font-semibold text-brand-primary underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {experienceDetailLoadError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 mb-2 text-sm text-amber-950">
                    <p>Could not load booking details. Please try again or contact us.</p>
                    <button
                      type="button"
                      onClick={() => retryBoats()}
                      className="mt-2 font-semibold text-brand-primary underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}
                      {ratesForSelection.length > 0 && !isTicketed && (
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-brand-dark mb-1.5 sm:mb-2 md:mb-3">Duration</p>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:flex sm:flex-wrap md:gap-3">
                      {[...ratesForSelection]
                        .sort((a, b) => a.durationHours - b.durationHours)
                        .map((r) => {
                        const isSelected = selectedRateIdForCalendar === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => selectCharterCalendarRate(r.id)}
                            className={cn(
                              "rounded-lg sm:rounded-xl border sm:border-2 px-1.5 py-1.5 sm:px-4 sm:py-3 text-[10px] leading-tight sm:text-sm font-semibold min-h-[36px] sm:min-h-[44px] md:min-h-[48px] transition-all text-center",
                              isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                            )}
                          >
                            {r.displayName ?? `${r.durationHours} hr`}
                          </button>
                        );
                      })}
                    </div>
                    {!selectedRateIdForCalendar && (
                      <p className="mt-2 text-xs text-brand-muted">Select a duration to see available dates.</p>
                    )}
                  </div>
                )}
                {selectedRateIdForCalendar && (
                  <>
                  <div className="relative w-full min-w-0 max-w-full overflow-x-clip">
                  <div className="flex flex-col items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 md:mb-3">
                    <p className="text-[11px] sm:text-xs font-semibold text-brand-dark w-full">Date</p>
                    <div className="flex items-center justify-center gap-1 sm:gap-2 w-full min-w-0">
                      <button
                        type="button"
                        disabled={isViewMonthCurrent || !canGoPrevMonth}
                        onClick={() => {
                          if (viewMonthMonth === 1) {
                            setViewMonthYear((y) => y - 1);
                            setViewMonthMonth(12);
                          } else {
                            setViewMonthMonth((m) => m - 1);
                          }
                        }}
                        className={cn(
                          "rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 text-brand-dark transition-colors touch-manipulation shrink-0",
                          (isViewMonthCurrent || !canGoPrevMonth) ? "cursor-not-allowed opacity-40" : "hover:bg-brand-dark/10 active:bg-brand-dark/15"
                        )}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                      </button>
                      <span className="text-xs sm:text-base md:text-lg font-semibold text-brand-dark min-w-0 flex-1 text-center truncate px-0.5">
                        {viewMonthLabel}
                      </span>
                      <button
                        type="button"
                        disabled={!canGoNextMonth}
                        onClick={() => {
                          if (viewMonthMonth === 12) {
                            setViewMonthYear((y) => y + 1);
                            setViewMonthMonth(1);
                          } else {
                            setViewMonthMonth((m) => m + 1);
                          }
                        }}
                        className={cn(
                          "rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 text-brand-dark transition-colors touch-manipulation shrink-0",
                          !canGoNextMonth ? "cursor-not-allowed opacity-40" : "hover:bg-brand-dark/10 active:bg-brand-dark/15"
                        )}
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                      </button>
                    </div>
                  </div>
                  {slotsLoadError && (
                    <p className="text-sm text-amber-700 py-3 px-2 mb-2">
                      Unable to load availability. Please try again, or{" "}
                      <a href="/contact" className="font-medium text-brand-primary underline underline-offset-2">
                        contact us
                      </a>{" "}
                      if the problem persists.
                    </p>
                  )}
                  {monthSlots.length === 0 &&
                    !slotsLoading &&
                    !slotsLoadError &&
                    selectedExperience &&
                    selectedRateIdForCalendar && (
                      <p className="text-sm text-brand-muted text-center py-2 px-2 mb-2" role="status">
                        No trips available this month. Try a different month.
                      </p>
                    )}
                  {slotsPartialData && selectedDate != null && !selectedDateVerifiedInPartial && (
                    <div
                      className="w-full rounded-lg border border-amber-300 bg-amber-50/90 p-3 mb-3 text-sm text-amber-950"
                      role="status"
                    >
                      <p>
                        Availability data may be slightly delayed — your slot will be confirmed at checkout.
                        {" "}
                        <button
                          type="button"
                          onClick={() => retrySlots()}
                          className="font-semibold text-brand-primary underline underline-offset-2"
                        >
                          Refresh
                        </button>
                      </p>
                    </div>
                  )}
                  {datePricesRateMismatchMessage && (
                    <div
                      className="w-full rounded-lg border border-amber-300 bg-amber-50/90 p-3 mb-3 text-sm text-amber-950"
                      role="alert"
                    >
                      {datePricesRateMismatchMessage}
                    </div>
                  )}
                  {multiBoatListing && !isTicketed && (
                    <p className="text-[10px] text-brand-muted text-center mb-2 px-1">
                      Calendar prices may vary by boat; your final price updates after you select a boat.
                    </p>
                  )}
                  <div key={calendarRenderKey} className="w-full min-w-0 max-w-full">
                    <div className="grid grid-cols-7 gap-px sm:gap-0.5 md:gap-2 min-w-0">
                      {WEEKDAY_LABELS.map((dayLabel, dayIdx) => (
                        <div key={`step3-weekday-${dayIdx}`} className="text-center text-[9px] sm:text-xs font-semibold uppercase tracking-wide text-brand-muted py-0.5 sm:py-1 shrink-0 min-w-0 flex items-center justify-center leading-none">
                          {dayLabel}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px sm:gap-1 md:gap-2 mt-0.5 sm:mt-1 min-w-0">
                      {step3CalendarGrid.map((cell, idx) => {
                      if (cell == null) {
                        return <div key={`empty-${idx}`} className="aspect-square min-w-0 sm:aspect-auto sm:min-h-[58px] md:min-h-[64px]" />;
                      }
                      const { dateStr, label, weekday } = cell;
                      const isSelected = selectedDate === dateStr;
                      const isPast = dateStr < chicagoTodayStr;
                      const entry = slotsByDate.get(dateStr);
                      const openForDuration =
                        isTicketed
                          ? (entry?.open ?? 0)
                          : (rateForCalendar?.durationHours != null
                            ? (openCountByDateAndDuration.get(dateStr)?.get(rateForCalendar.durationHours) ?? 0)
                            : (entry?.open ?? 0));
                      const ticketsLeft = isTicketed ? (ticketsAvailableByDate[dateStr] ?? null) : null;
                      const dateSeasonalAllowed = !selectedExperience?.seasonal?.enabled || isSeasonalAllowed(selectedExperience.seasonal, new Date(dateStr + "T12:00:00"), dateStr);
                      const isAvailable = !isPast && dateSeasonalAllowed && (isTicketed
                        ? openForDuration > 0
                        : openForDuration > 0);
                      const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                      const bookedCount = entry?.booked ?? 0;
                      const ticketsBooked = isTicketed ? (ticketsBookedByDate[dateStr] ?? 0) : 0;
                      const displayBookedCount = isTicketed ? ticketsBooked : bookedCount;
                      const isFullyBooked = !isPast && (isTicketed
                        ? (entry != null && (ticketsLeft === 0 || (ticketsLeft == null && (entry?.open ?? 0) === 0)))
                        : (takenCount > 0 && openForDuration === 0));
                      const hasBookingsUrgency = !isPast && (isTicketed ? ticketsBooked > 0 : (isAvailable && bookedCount > 0));
                      const isUnavailable = !isPast && !isAvailable && !isFullyBooked;
                      const isOutsideSeasonal = selectedExperience?.seasonal?.enabled && !dateSeasonalAllowed;
                      const priceCents = datePrices[dateStr];
                      const isHoliday = holidayDateStrings.has(dateStr);
                      const holdUncertain =
                        isTicketed &&
                        isAvailable &&
                        !isPast &&
                        !isFullyBooked &&
                        holdDataMissingByDate.has(dateStr);
                      const a11yStatus = isPast
                        ? "past date"
                        : isOutsideSeasonal
                          ? "outside booking season"
                          : isFullyBooked
                            ? "fully booked"
                            : !isAvailable
                              ? "unavailable"
                              : holdUncertain
                                ? "available, hold counts may be incomplete"
                                : "available";
                      const priceA11y =
                        typeof priceCents === "number" && isAvailable
                          ? `, $${(priceCents / 100).toFixed(0)}${isTicketed ? " per ticket" : ""}`
                          : "";
                      const holidayA11y = isHoliday && !isPast ? ", holiday pricing" : "";
                      const urgencyA11y =
                        hasBookingsUrgency && !isFullyBooked && !isPast
                          ? `, ${displayBookedCount} already booked this day`
                          : "";
                      const dateAriaLabel = `${weekday} ${label}, ${viewMonthLabel}. ${a11yStatus}${priceA11y}${holidayA11y}${urgencyA11y}${
                        holdUncertain ? ", availability uncertain" : ""
                      }`;
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast || !isAvailable || isFullyBooked || isOutsideSeasonal}
                          onClick={() => {
                            if (!isAvailable) return;
                            setSelectedDate(dateStr);
                            setSelectedSlot(null);
                          }}
                          aria-label={dateAriaLabel}
                          title={isHoliday ? "Holiday pricing" : hasBookingsUrgency ? `${displayBookedCount} already booked this day` : undefined}
                          className={cn(
                            "rounded-md sm:rounded-xl border max-sm:border sm:border-2 max-sm:p-0.5 sm:p-1 sm:py-2 sm:px-1.5 md:py-2.5 md:px-2 text-center transition-all aspect-square sm:aspect-auto sm:min-h-[58px] md:min-h-[64px] flex flex-col justify-center gap-0 max-sm:gap-0 sm:gap-0.5 touch-manipulation min-w-0 max-w-full overflow-hidden",
                            isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                            isUnavailable && !isPast && "bg-brand-dark/10 text-brand-muted border-brand-dark/15 cursor-not-allowed",
                            isFullyBooked && "bg-red-100/95 text-red-900 border-red-400/60 cursor-not-allowed",
                            hasBookingsUrgency && !isFullyBooked && !isHoliday && "bg-amber-50/95 text-amber-900 border-amber-400/50",
                            hasBookingsUrgency && !isFullyBooked && isHoliday && "bg-amber-50/90 border-amber-400/50 text-amber-900",
                            isHoliday && !isPast && !hasBookingsUrgency && "ring-1 sm:ring-1.5 ring-violet-400/80 bg-violet-50/90 border-violet-300/60",
                            isAvailable && !isHoliday && !hasBookingsUrgency &&
                              "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60 active:scale-[0.98]",
                            isAvailable && isHoliday && !hasBookingsUrgency && "text-violet-900 border-violet-400/60 hover:bg-violet-100 active:scale-[0.98]",
                            isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-1 sm:ring-2 ring-brand-primary/40",
                            isOutsideSeasonal && "opacity-50 cursor-not-allowed border-brand-dark/10 bg-brand-dark/5",
                            holdUncertain && "border-dashed border-amber-500/70 ring-1 ring-amber-400/40"
                          )}
                        >
                          <span className="hidden sm:block text-[10px] md:text-xs text-brand-muted uppercase leading-tight">{weekday}</span>
                          <span className="block font-semibold text-[11px] sm:text-sm md:text-base leading-none max-sm:mt-0 sm:mt-0.5">{label}</span>
                          {datePricesLoading && isAvailable && (
                            <span
                              className="block h-3 w-10 sm:h-3.5 sm:w-12 mx-auto mt-0.5 sm:mt-0.5 rounded-md bg-brand-dark/15 animate-pulse"
                              aria-hidden
                            />
                          )}
                          {!datePricesLoading && typeof priceCents === "number" && isAvailable && (
                            <span className={cn(
                              "block text-[9px] sm:text-sm font-bold leading-none max-sm:truncate mt-0.5 sm:mt-0.5",
                              isSelected ? "text-brand-primary" : hasBookingsUrgency ? "text-amber-800" : "text-emerald-800"
                            )}>
                              ${(priceCents / 100).toFixed(0)}{isTicketed && <span className="text-[8px] sm:text-[10px] font-normal">/ea</span>}
                            </span>
                          )}
                          {hasBookingsUrgency && (
                            <span className="block text-[8px] sm:text-[10px] font-semibold text-amber-700 leading-none mt-0.5 max-sm:truncate">
                              {displayBookedCount} booked
                            </span>
                          )}
                          {isAvailable && isTicketed && ticketsLeft !== null && ticketsLeft <= 10 && !hasBookingsUrgency && (
                            <span className="block text-[8px] sm:text-[10px] font-semibold text-amber-700 leading-none mt-0.5 max-sm:truncate">{ticketsLeft} left</span>
                          )}
                          {isFullyBooked && (
                            <span className="block text-[9px] sm:text-xs font-semibold text-red-700 leading-tight mt-0.5">Full</span>
                          )}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                  {(slotsLoading || datePricesLoading) && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 rounded-xl z-10" aria-busy="true" aria-live="polite">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                      <span className="text-sm font-medium text-brand-muted text-center px-2">
                        {slotsLoading && datePricesLoading
                          ? "Loading availability & prices…"
                          : slotsLoading
                            ? "Loading availability…"
                            : "Loading dates & prices…"}
                      </span>
                    </div>
                  )}
                </div>
                {selectedDate && (
                  <div className="min-h-[2.5rem] transition-[opacity] duration-150 ease-out">
                    {isTicketed ? (
                      departureTimeLabel ? (
                        <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 px-4 py-3">
                          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-0.5">Departure time</p>
                          <p className="text-base font-bold text-brand-dark">{departureTimeLabel}</p>
                          {(slotsLoading || ticketCountsLoading) && (
                            <p className="text-xs text-brand-muted mt-1">Checking availability…</p>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length === 0 && (
                            <p className="text-xs text-amber-700 mt-1">No availability this day — please pick another date.</p>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length > 0 && ticketCounts && (
                            <div className="mt-2 flex items-center gap-2">
                              {ticketCounts.conservativeEstimate === true ? (
                                <p className="text-xs font-medium text-brand-dark flex-1" role="status">
                                  {ticketCounts.availabilityNote ??
                                    "Availability may be limited — your selection will be confirmed at checkout"}
                                </p>
                              ) : (
                                <>
                                  <div className="flex-1 h-1.5 rounded-full bg-brand-dark/10 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-brand-primary transition-all"
                                      style={{
                                        width: `${Math.round(((ticketCounts.total - ticketCounts.available) / ticketCounts.total) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <p className="text-xs font-semibold text-brand-dark whitespace-nowrap">
                                    {ticketCounts.available} / {ticketCounts.total} tickets left
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                          {datePricesPartialData && (
                            <p className="text-[11px] text-amber-800/90 mt-1.5" role="status">
                              Exact availability will be confirmed at checkout.
                            </p>
                          )}
                          {!slotsLoading &&
                            !ticketCountsLoading &&
                            openSlotsForDate.length > 0 &&
                            !ticketCounts &&
                            !ticketCountsError && (
                              <p className="text-xs text-brand-muted mt-1">Confirming ticket availability…</p>
                            )}
                          {ticketCountsError && (
                            <div className="mt-2 flex flex-col gap-2">
                              <p className="text-sm font-medium text-amber-800">
                                {ticketCountsError}
                              </p>
                              <button
                                type="button"
                                onClick={() => retryTicketCounts()}
                                className="w-full rounded-lg bg-brand-primary text-white text-sm font-semibold py-2.5 px-3 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        slotsLoading ? <p className="text-xs text-brand-muted">Loading times…</p> : null
                      )
                    ) : (
                      <>
                      <p className="text-[11px] sm:text-xs font-semibold text-brand-dark mb-1 sm:mb-1.5 md:mb-2">Time</p>
                      {slotsLoading ? (
                        <p className="text-xs text-brand-muted">Loading times…</p>
                      ) : (() => {
                        const slotsForDay = openSlotsByTime
                          .filter((s) => isoToChicagoDateStr(s.startAt) === selectedDate)
                          .sort((a, b) => slotTimeSortKey(a.startAt, a.id) - slotTimeSortKey(b.startAt, b.id));
                        return slotsForDay.length === 0 ? (
                          <p className="text-xs text-brand-muted">No open slots this day.</p>
                        ) : (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {slotsForDay.map((slot) => {
                            const isSelected = selectedSlot?.id === slot.id;
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => {
                                  const expSlug = (selectedExperience?.slug ?? "").toLowerCase().trim();
                                  const watersportsCharter = !isTicketed && selectedExperience != null && isWatersportsSlug(expSlug);
                                  const scope =
                                    watersportsCharter && wakeCharterBoatIdsForStep2 != null
                                      ? (selectedBoat != null && wakeCharterBoatIdsForStep2.has(selectedBoat.id)
                                          ? new Set<string>([selectedBoat.id])
                                          : wakeCharterBoatIdsForStep2.size > 0
                                            ? wakeCharterBoatIdsForStep2
                                            : null)
                                      : null;
                                  const candidates = monthSlots
                                    .filter((s) => {
                                      if (s.id !== slot.id || s.status !== "open") return false;
                                      if (scope == null) return true;
                                      const bid = (s.boatId ?? "").trim();
                                      return bid.length > 0 && scope.has(bid);
                                    })
                                    .sort((a, b) => (a.boatId ?? "").localeCompare(b.boatId ?? ""));
                                  if (candidates[0]) setSelectedSlot(candidates[0] as SlotDto);
                                }}
                                className={cn(
                                  "rounded-lg border sm:border-2 px-2.5 py-2 text-xs sm:text-sm font-medium transition-all min-h-[40px] sm:min-h-[44px] touch-manipulation sm:px-3 sm:py-2.5 md:px-4 md:py-2.5",
                                  isSelected ? "border-brand-primary bg-brand-primary/10" : "border-brand-dark/15 hover:border-brand-dark/30"
                                )}
                              >
                                {slot.timeLabel}
                              </button>
                            );
                          })}
                        </div>
                      );
                      })()}
                      </>
                    )}
                    {noRateForSelectedSlot && (
                      <p className="text-xs text-amber-700 mt-2" role="alert">
                        This time slot is not currently available for online booking — please choose another time or contact us.
                      </p>
                    )}
                  </div>
                )}
                </>
                )}
              </div>
  );
}
