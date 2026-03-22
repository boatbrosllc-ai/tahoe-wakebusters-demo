"use client";

import { useEffect } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";

const MAX_WARM_EXPERIENCES = 4;
/** Delay after each experience (after the first) so we do not burst the server. */
const STAGGER_MS = 400;

/**
 * Preloads booking data on site load so the booking modal can show the calendar
 * and dates immediately when opened (FareHarbor-style seamless experience).
 *
 * Fetches: experiences list → up to the first four experiences' detail + rates + first month
 * date-prices + slots. All go into the shared booking cache; the modal reads
 * from the same cache so no visible loading when user opens Book.
 *
 * Retries the initial experiences fetch once after a short delay on failure
 * (e.g. "Failed to fetch" when API isn't ready yet on cold load).
 */
export function BookingPreload() {
  useEffect(() => {
    bookingCache.initCrossTabInvalidation();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    function warmExperience(experienceId: string): Promise<void> {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

      return Promise.all([
        bookingCache.fetchExperienceDetail(experienceId),
        bookingCache.fetchExperienceRates(experienceId),
      ])
        .then(([detail, ratesData]) => {
          if (cancelled) return;
          const rates = (detail?.rates ?? ratesData?.rates ?? []) as Array<{ id: string }>;
          const firstRateId = rates.length > 0 ? rates[0].id : undefined;
          const restRateIds = rates.slice(1).map((r) => r.id).filter(Boolean);

          const datePricesPromise =
            firstRateId != null
              ? bookingCache.fetchDatePrices(experienceId, startStr, daysInMonth, firstRateId)
              : Promise.resolve();
          if (restRateIds.length > 0) {
            bookingCache.prefetchDatePrices(experienceId, startStr, daysInMonth, restRateIds);
          }
          const promises: Promise<unknown>[] = [
            datePricesPromise,
            bookingCache.fetchSlots(experienceId, startStr, endStr),
          ];
          return Promise.allSettled(promises);
        })
        .then(() => {})
        .catch(() => {});
    }

    const runAfterExperiences = (data: Awaited<ReturnType<typeof bookingCache.fetchExperiences>>) => {
      if (cancelled) return;
      const experiences = data?.experiences ?? [];
      const cap = Math.min(MAX_WARM_EXPERIENCES, experiences.length);

      const runChain = async () => {
        for (let i = 0; i < cap; i++) {
          if (cancelled) return;
          if (i > 0) await new Promise<void>((r) => setTimeout(r, STAGGER_MS));
          if (cancelled) return;
          const exp = experiences[i];
          if (!exp?.id) continue;
          await warmExperience(exp.id);
        }
      };

      void runChain();
    };

    const attempt = () =>
      bookingCache
        .fetchExperiences()
        .then((data) => runAfterExperiences(data))
        .catch(() => {
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
