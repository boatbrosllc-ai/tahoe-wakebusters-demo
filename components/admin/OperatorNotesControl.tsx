"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  readOperatorNotesLog,
  type OperatorNoteEntry,
  type OperatorNotesPublic,
} from "@/lib/admin/operator-notes";
import { OperatorNotesTimeline } from "@/components/admin/OperatorNotesTimeline";

export function OperatorNotesControl({
  bookingId,
  current,
  updatedAt,
  updatedBy,
  log,
  captainAssigned,
  onSaved,
}: {
  bookingId: string;
  current: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  log?: OperatorNoteEntry[] | null;
  captainAssigned?: boolean;
  onSaved?: (next: OperatorNotesPublic) => void;
}) {
  const [value, setValue] = useState("");
  const [notifyCaptain, setNotifyCaptain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<OperatorNoteEntry[]>(() =>
    readOperatorNotesLog({
      operatorNotes: current,
      operatorNotesUpdatedAt: updatedAt,
      operatorNotesBy: updatedBy,
      operatorNotesLog: log,
    })
  );

  useEffect(() => {
    setValue("");
    setNotifyCaptain(false);
    setError(null);
    setNotice(null);
  }, [bookingId]);

  useEffect(() => {
    setEntries(
      readOperatorNotesLog({
        operatorNotes: current,
        operatorNotesUpdatedAt: updatedAt,
        operatorNotesBy: updatedBy,
        operatorNotesLog: log,
      })
    );
  }, [bookingId, current, updatedAt, updatedBy, log]);

  const canSave = value.trim().length > 0 && !busy;
  const countLabel = useMemo(() => {
    if (entries.length === 0) return null;
    return entries.length === 1 ? "1 note" : `${entries.length} notes`;
  }, [entries.length]);

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/operator-notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorNotes: value,
          notifyCaptain: captainAssigned && notifyCaptain,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      const next: OperatorNotesPublic = {
        operatorNotes: typeof json.operatorNotes === "string" ? json.operatorNotes : null,
        operatorNotesUpdatedAt: typeof json.operatorNotesUpdatedAt === "string" ? json.operatorNotesUpdatedAt : null,
        operatorNotesBy: typeof json.operatorNotesBy === "string" ? json.operatorNotesBy : null,
        operatorNotesLog: Array.isArray(json.operatorNotesLog) ? json.operatorNotesLog : [],
      };
      onSaved?.(next);
      setEntries(
        next.operatorNotesLog.length
          ? next.operatorNotesLog
          : readOperatorNotesLog(next)
      );
      setValue("");
      setNotifyCaptain(false);
      if (json.emailError) {
        setNotice("Saved, but the captain email did not send.");
      } else if (json.emailSent) {
        setNotice("Added. The captain was emailed this update.");
      } else {
        setNotice("Added. This shows on the captain’s calendar.");
      }
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/30 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Note for captain</p>
        {countLabel && <p className="text-[11px] text-brand-muted">{countLabel}</p>}
      </div>
      <p className="mt-1 text-xs text-brand-muted">Only the captain sees this. Guests never do.</p>

      <label htmlFor={`captain-note-${bookingId}`} className="mt-3 block text-xs font-medium text-brand-dark">
        Add an update
      </label>
      <textarea
        id={`captain-note-${bookingId}`}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_OPERATOR_NOTES_LENGTH))}
        rows={3}
        maxLength={MAX_OPERATOR_NOTES_LENGTH}
        placeholder="Pickup change, running late, anything new the captain should know…"
        className="mt-1 w-full resize-y rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm text-brand-dark"
      />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {captainAssigned ? (
          <label className="flex items-center gap-2 text-xs text-brand-dark">
            <input
              type="checkbox"
              checked={notifyCaptain}
              onChange={(e) => setNotifyCaptain(e.target.checked)}
              className="rounded border-brand-dark/20"
            />
            Also email the captain
          </label>
        ) : (
          <p className="text-xs text-brand-muted">Assign a captain to show this on their calendar.</p>
        )}
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : entries.length > 0 ? "Add update" : "Add note"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {notice && <p className="mt-2 text-xs text-emerald-800">{notice}</p>}

      {entries.length > 0 && (
        <div className="mt-4 border-t border-brand-dark/10 pt-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Activity</p>
          <OperatorNotesTimeline entries={entries} />
        </div>
      )}
    </div>
  );
}
