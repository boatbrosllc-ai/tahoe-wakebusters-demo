"use client";

import { useEffect } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";

const MAX_WARM_EXPERIENCES = 1;
/** Only warm the primary pontoon listing; `useBookingModalData` loads detail/slots when the modal opens. */
const PREFERRED_WARM_SLUG = "pontoon";

function scheduleWhenIdle(cb: () => void): void {
  if (typeof window === "undefined") return;
  const ric = (
    window as Window & {
      requestIdleCallback?: (fn: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") {
    ric(cb, { timeout: 4000 });
  } else {
    setTimeout(cb, 1);
  }
}

/**
 * Light booking warm on idle: experiences list → pontoon (or first listing) gets
 * `fetchExperienceRates` + `prefetchDatePrices` only. No detail/slots prefetch (modal loads those lazily).
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

      return bookingCache
        .fetchExperienceRates(experienceId)
        .then((ratesData) => {
          if (cancelled) return;
          const rates = (ratesData?.rates ?? []) as Array<{ id: string }>;
          const allRateIds = rates.map((r) => r.id).filter(Boolean);
          if (allRateIds.length > 0) {
            bookingCache.prefetchDatePrices(experienceId, startStr, daysInMonth, allRateIds, undefined);
          }
        })
        .then(() => {})
        .catch(() => {});
    }

    const runAfterExperiences = (data: Awaited<ReturnType<typeof bookingCache.fetchExperiences>>) => {
      if (cancelled) return;
      const experiences = data?.experiences ?? [];
      const preferred = experiences.find((e) => e.slug === PREFERRED_WARM_SLUG);
      const cap = Math.min(MAX_WARM_EXPERIENCES, experiences.length);
      const toWarm =
        preferred?.id != null ? [preferred] : experiences.slice(0, cap).filter((e) => e?.id);

      const queue = toWarm.filter((e) => e?.id);
      const worker = async (): Promise<void> => {
        while (queue.length > 0 && !cancelled) {
          const exp = queue.shift();
          if (!exp?.id) continue;
          await warmExperience(exp.id);
        }
      };
      void Promise.all([worker(), worker()]);
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

    scheduleWhenIdle(() => {
      if (!cancelled) attempt();
    });

    return () => {
      cancelled = true;
      if (retryTimeoutId != null) clearTimeout(retryTimeoutId);
    };
  }, []);

  return null;
}
