"use client";

import { useEffect } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";

/**
 * Preloads booking data on site load so the booking modal can show the calendar
 * and dates immediately when opened (FareHarbor-style seamless experience).
 *
 * Fetches: experiences list → first experience's detail + rates + first month
 * date-prices + slots. All go into the shared booking cache; the modal reads
 * from the same cache so no visible loading when user opens Book.
 *
 * Retries the initial experiences fetch once after a short delay on failure
 * (e.g. "Failed to fetch" when API isn't ready yet on cold load).
 */
export function BookingPreload() {
  useEffect(() => {
    let cancelled = false;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const runAfterExperiences = (data: Awaited<ReturnType<typeof bookingCache.fetchExperiences>>) => {
      if (cancelled) return;
      const experiences = data?.experiences ?? [];
      const exp = experiences[0];
      if (!exp?.id) return;

      const experienceId = exp.id;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

      Promise.all([
        bookingCache.fetchExperienceDetail(experienceId),
        bookingCache.fetchExperienceRates(experienceId),
      ])
        .then(([detail, ratesData]) => {
          if (cancelled) return;
          const rates = (detail?.rates ?? ratesData?.rates ?? []) as Array<{ id: string }>;
          const firstRateId = rates.length > 0 ? rates[0].id : undefined;

          // Prefetch date-prices only for the first (default) rate to avoid race conditions and re-render chaos; modal fetches selected rate on demand.
          const datePricesPromise =
            firstRateId != null
              ? bookingCache.fetchDatePrices(experienceId, startStr, daysInMonth, firstRateId)
              : Promise.resolve();
          const promises: Promise<unknown>[] = [
            datePricesPromise,
            bookingCache.fetchSlots(experienceId, startStr, endStr),
          ];
          Promise.allSettled(promises)
            .then(() => {})
            .catch(() => {});
        })
        .catch(() => {});
    };

    const attempt = () =>
      bookingCache
        .fetchExperiences()
        .then((data) => runAfterExperiences(data))
        .catch((err) => {
          if (cancelled) return;
          const retryMs = 1500;
          retryTimeoutId = setTimeout(() => {
            if (cancelled) return;
            bookingCache
              .fetchExperiences()
              .then((data) => runAfterExperiences(data))
              .catch(() => {});
          }, retryMs);
        });

    attempt();

    return () => {
      cancelled = true;
      if (retryTimeoutId != null) clearTimeout(retryTimeoutId);
    };
  }, []);

  return null;
}
