"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";
import type { AssignedCaptainPublic } from "@/lib/admin/assigned-captain";

type CaptainOption = { email: string; name: string };

export function AssignCaptainControl({
  bookingId,
  current,
  onAssigned,
}: {
  bookingId: string;
  current: { email: string; name: string; assignedAt?: string | null; assignedBy?: string | null } | null;
  onAssigned?: (next: AssignedCaptainPublic | null) => void;
}) {
  const [captains, setCaptains] = useState<CaptainOption[]>([]);
  const [selected, setSelected] = useState(current?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelected(current?.email ?? "");
    if (current?.email) setChanging(false);
  }, [current?.email]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/captains", { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throwIfAdminApiError(res, json);
        if (!cancelled) {
          setCaptains(Array.isArray(json.captains) ? json.captains : []);
        }
      })
      .catch((e) => {
        if (e instanceof AdminSessionRedirectError) return;
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load captains");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (opts?: { resend?: boolean; unassign?: boolean }) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const captainEmail = opts?.unassign ? null : selected || null;
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-captain`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captainEmail,
            resend: opts?.resend === true,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throwIfAdminApiError(res, json);
        const next = (json.assignedCaptain ?? null) as AssignedCaptainPublic | null;
        onAssigned?.(next);
        setChanging(false);
        if (json.emailError) {
          setNotice("Saved, but the email did not send. Try Resend.");
        } else if (opts?.unassign) {
          setNotice("Captain removed.");
          setSelected("");
        } else if (opts?.resend) {
          setNotice("Confirmation sent again.");
        } else {
          setNotice("Captain notified. This trip is on their calendar.");
        }
      } catch (e) {
        if (e instanceof AdminSessionRedirectError) return;
        setError(e instanceof Error ? e.message : "Could not assign captain");
      } finally {
        setBusy(false);
      }
    },
    [bookingId, onAssigned, selected]
  );

  const showPicker = !current || changing;

  return (
    <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/30 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Captain</p>

      {current && !changing && (
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-brand-dark">{current.name}</p>
            <p className="truncate text-xs text-brand-muted">{current.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setNotice(null);
                setChanging(true);
                setSelected(current.email);
              }}
              className="text-brand-primary hover:underline disabled:opacity-50"
            >
              Change
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ resend: true })}
              className="text-brand-dark hover:underline disabled:opacity-50"
            >
              {busy ? "Sending…" : "Resend email"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ unassign: true })}
              className="text-red-700 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {showPicker && captains.length === 0 && (
        <p className="mt-2 text-xs text-brand-muted">
          No captain assigned yet.{" "}
          <Link href="/admin/team" className="font-medium text-brand-primary hover:underline">
            Invite captains in Team
          </Link>
        </p>
      )}

      {showPicker && captains.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark sm:min-w-[14rem] sm:flex-1"
            aria-label="Select captain"
          >
            <option value="">Select a captain</option>
            {captains.map((c) => (
              <option key={c.email} value={c.email}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !selected}
              onClick={() => void save()}
              className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : current ? "Update" : "Assign"}
            </button>
            {changing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChanging(false);
                  setSelected(current?.email ?? "");
                  setError(null);
                }}
                className="rounded-full px-3 py-2 text-xs font-semibold text-brand-muted hover:text-brand-dark disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {notice && <p className="mt-2 text-xs text-emerald-800">{notice}</p>}
    </div>
  );
}
