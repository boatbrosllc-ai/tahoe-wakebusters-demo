"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BOOKING_PREVIEW } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";
import type { BookingModalInitialSelection } from "@/lib/booking/booking-modal-types";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import type { ExperienceListItem } from "@/lib/booking/booking-data-cache";
import {
  isPontoonSlug,
  isWatersportsSlug,
  isWakeSurfClubSlug,
  resolveExperiencePricingType,
} from "@/lib/booking/experience-aliases";

const durationOptions = BOOKING_PREVIEW.durations;

type PickerSlotId = "pontoon" | "wake" | "sunset" | "club";

const PICKER_SLOTS: { id: PickerSlotId; label: string; match: (slug: string) => boolean }[] = [
  { id: "pontoon", label: "Pontoon", match: (s) => isPontoonSlug(s) },
  { id: "wake", label: "Wake boat", match: (s) => isWatersportsSlug(s) },
  { id: "sunset", label: "Sunset cruise", match: (s) => /^(sunset|sunset-cruise)$/i.test(s) },
  { id: "club", label: "Wakesurf Club", match: (s) => isWakeSurfClubSlug(s) },
];

function pickExperiencesForPicker(list: ExperienceListItem[]): Map<PickerSlotId, ExperienceListItem> {
  const map = new Map<PickerSlotId, ExperienceListItem>();
  for (const slot of PICKER_SLOTS) {
    const found = list.find((e) => e.active !== false && slot.match((e.slug ?? "").toLowerCase()));
    if (found) map.set(slot.id, found);
  }
  return map;
}

export function BookingPreviewCard({
  onCheckAvailability,
  onSelectionChange,
  sectionId,
  experienceId,
  experienceSlug,
  pricingType: pricingTypeProp = "charter",
  fromPriceCents: fromPriceCentsProp,
  maxPartySize: maxPartySizeProp,
  variant = "dark",
  showExperiencePicker = false,
}: {
  onCheckAvailability?: (selection: BookingModalInitialSelection) => void;
  onSelectionChange?: (selection: BookingModalInitialSelection) => void;
  sectionId?: string;
  experienceId?: string;
  experienceSlug: string;
  pricingType?: "charter" | "ticketed";
  fromPriceCents?: number | null;
  maxPartySize?: number;
  variant?: "dark" | "light";
  /** Pillar SEO pages: let guest pick pontoon / wake / sunset / club before booking. */
  showExperiencePicker?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const light = variant === "light";

  const [pickerOptions, setPickerOptions] = useState<Map<PickerSlotId, ExperienceListItem>>(new Map());
  const [pickerSlot, setPickerSlot] = useState<PickerSlotId>("pontoon");
  const [duration, setDuration] = useState<number>(BOOKING_PREVIEW.durations[1]);
  const [guests, setGuests] = useState(6);

  useEffect(() => {
    if (!showExperiencePicker) return;
    const ac = new AbortController();
    bookingCache
      .fetchExperiences(ac.signal)
      .then((data) => {
        const list = Array.isArray(data?.experiences) ? data.experiences : [];
        const map = pickExperiencesForPicker(list);
        setPickerOptions(map);
        const initialSlug = (experienceSlug ?? "pontoon").toLowerCase();
        for (const slot of PICKER_SLOTS) {
          if (slot.match(initialSlug) && map.has(slot.id)) {
            setPickerSlot(slot.id);
            break;
          }
        }
      })
      .catch(() => setPickerOptions(new Map()));
    return () => ac.abort();
  }, [showExperiencePicker, experienceSlug]);

  const selectedExperience = showExperiencePicker ? pickerOptions.get(pickerSlot) : null;

  const effectiveSlug = showExperiencePicker
    ? (selectedExperience?.slug ?? experienceSlug)
    : experienceSlug;
  const effectivePricingType = showExperiencePicker
    ? selectedExperience
      ? resolveExperiencePricingType(selectedExperience)
      : pricingTypeProp
    : pricingTypeProp;
  const isTicketed = effectivePricingType === "ticketed";
  const fromPriceCents = showExperiencePicker
    ? (selectedExperience?.fromPriceCents ?? fromPriceCentsProp)
    : fromPriceCentsProp;
  const effectiveMax =
    (showExperiencePicker ? selectedExperience?.maxGuests : maxPartySizeProp) != null &&
    (showExperiencePicker ? selectedExperience!.maxGuests : maxPartySizeProp)! > 0
      ? showExperiencePicker
        ? selectedExperience!.maxGuests
        : maxPartySizeProp!
      : BOOKING_PREVIEW.maxGuests;

  const buildSelection = useCallback((): BookingModalInitialSelection => {
    return {
      ...(experienceId && !showExperiencePicker ? { experienceId } : {}),
      ...(selectedExperience?.id ? { experienceId: selectedExperience.id } : {}),
      experienceSlug: effectiveSlug,
      pricingType: effectivePricingType,
      bookingMode: isTicketed ? "shared" : "charter",
      ...(!isTicketed ? { durationHours: duration } : {}),
      partySize: guests,
    };
  }, [
    duration,
    effectiveSlug,
    effectivePricingType,
    experienceId,
    guests,
    isTicketed,
    selectedExperience?.id,
    showExperiencePicker,
  ]);

  useEffect(() => {
    onSelectionChange?.(buildSelection());
  }, [buildSelection, onSelectionChange]);

  useEffect(() => {
    setGuests(isTicketed ? 1 : 6);
  }, [isTicketed, pickerSlot]);

  const openAvailability = () => {
    if (sectionId && !light) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    }
    const selection = buildSelection();
    onCheckAvailability?.(selection);
  };

  const labelClass = light ? "text-brand-dark/80" : "text-white/90";
  const mutedClass = light ? "text-brand-muted" : "text-white/60";
  const priceClass = light ? "text-brand-dark" : "text-white";
  const priceMutedClass = light ? "text-brand-muted" : "text-white/70";
  const guestCountClass = light ? "text-brand-dark font-medium" : "text-white font-medium";

  const pickerReady = !showExperiencePicker || pickerOptions.size > 0;

  const tripButtonClass = (active: boolean) =>
    cn(
      "py-2.5 px-2 rounded-xl text-xs sm:text-sm font-medium transition-all text-center leading-tight",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
      active
        ? "bg-brand-primary text-brand-dark shadow-sm"
        : light
          ? "bg-brand-bg text-brand-dark hover:bg-brand-primary/15 border border-brand-dark/10"
          : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20"
    );

  return (
    <motion.div
      className={cn(
        light
          ? "p-0"
          : "rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      )}
      initial={reduceMotion ? false : { opacity: 0, y: light ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: light ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {showExperiencePicker ? (
        <div className="mb-4">
          <p className={cn("text-sm font-medium mb-2", labelClass)}>Trip type</p>
          {pickerReady ? (
            <div className="grid grid-cols-2 gap-2">
              {PICKER_SLOTS.filter((slot) => pickerOptions.has(slot.id)).map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setPickerSlot(slot.id)}
                  className={tripButtonClass(pickerSlot === slot.id)}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {PICKER_SLOTS.map((slot) => (
                <div
                  key={slot.id}
                  className={cn("h-11 rounded-xl animate-pulse", light ? "bg-brand-dark/10" : "bg-white/20")}
                  aria-hidden
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!isTicketed && (
        <>
          <p className={cn("text-sm font-medium mb-2", labelClass)}>Duration</p>
          <div className="flex gap-2 mb-4">
            {durationOptions.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setDuration(h)}
                className={cn(
                  "flex-1 min-w-0 py-2.5 rounded-xl text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                  duration === h
                    ? "bg-brand-primary text-brand-dark"
                    : light
                      ? "bg-brand-bg text-brand-dark hover:bg-brand-primary/15 border border-brand-dark/10"
                      : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20"
                )}
              >
                {h}h
              </button>
            ))}
          </div>
        </>
      )}

      <p className={cn("text-sm font-medium mb-2", labelClass)}>{isTicketed ? "Tickets" : "Guests"}</p>
      <div className="flex items-center gap-3 mb-5">
        <label htmlFor="booking-guests" className="sr-only">
          {isTicketed ? "Number of tickets" : "Number of guests"}
        </label>
        <input
          id="booking-guests"
          type="range"
          min={BOOKING_PREVIEW.minGuests}
          max={effectiveMax}
          value={Math.min(guests, effectiveMax)}
          onChange={(e) => setGuests(Number(e.target.value))}
          className={cn(
            "flex-1 h-2 rounded-full appearance-none accent-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary",
            light ? "bg-brand-dark/10" : "bg-white/20"
          )}
        />
        <span className={cn("w-8 text-right", guestCountClass)} aria-hidden="true">
          {guests}
        </span>
      </div>

      <p className={cn("text-2xl font-bold mb-1", priceClass)}>
        {fromPriceCents != null && fromPriceCents > 0 ? (
          <>
            From ${(fromPriceCents / 100).toFixed(0)}
            <span className={cn("text-base font-normal", priceMutedClass)}>
              {isTicketed ? " / ticket" : " / trip"}
            </span>
          </>
        ) : (
          <span
            className={cn(
              "inline-block h-8 w-32 animate-pulse rounded-lg align-middle",
              light ? "bg-brand-dark/10" : "bg-white/20"
            )}
            aria-hidden
          />
        )}
      </p>
      <p className={cn("text-sm mb-4", mutedClass)}>Prices vary by date</p>

      <Button
        size="lg"
        onClick={openAvailability}
        disabled={showExperiencePicker && !pickerReady}
        className="w-full rounded-xl h-12 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold focus-visible:ring-brand-primary disabled:opacity-60"
      >
        {isTicketed ? "Check availability" : "See available dates"}
      </Button>
      <p className={cn("text-xs text-center mt-3", mutedClass)}>{BOOKING_PREVIEW.trustLine}</p>
    </motion.div>
  );
}
