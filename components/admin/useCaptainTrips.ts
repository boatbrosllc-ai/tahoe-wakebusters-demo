"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";
import type { CaptainTrip } from "@/lib/admin/captain-trip";

export function useCaptainTrips(from: string, to: string): {
  events: CaptainTrip[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [events, setEvents] = useState<CaptainTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/calendar-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      const list = Array.isArray(json.events) ? (json.events as CaptainTrip[]) : [];
      setEvents(list.filter((e) => e.type === "booking"));
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Could not load your trips");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { events, loading, error, reload: load };
}
