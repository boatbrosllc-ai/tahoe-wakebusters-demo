"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, MapPin, Save } from "lucide-react";
import { fetchAdminPatchWithForceRetry } from "@/lib/admin-dashboard-patch-with-force";
import {
  confirmationCopyFormFromExperience,
  logisticsFromCopyForm,
  parseConfirmationEmail,
  type ConfirmationCopyForm,
  type ExperienceEmailLogistics,
} from "@/lib/booking/experience-email-logistics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputClass =
  "mt-1 block w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-dark placeholder:text-brand-muted/70 focus:border-brand-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary";
const textareaClass = `${inputClass} min-h-[88px] resize-y`;

type ExperienceOption = { id: string; title: string; active: boolean };

export type ConfirmationCopyDraft = {
  experienceTitle: string;
  logistics: ExperienceEmailLogistics;
};

const emptyForm: ConfirmationCopyForm = {
  locationTitle: "",
  locationAddress: "",
  locationNotes: "",
  entranceFeeText: "",
  arrivalInstructions: "",
  rulesText: "",
  gratuityText: "",
  additionalNotes: "",
  whatToBringText: "",
};

export function ConfirmationEmailCopyEditor({
  onDraftChange,
}: {
  onDraftChange: (draft: ConfirmationCopyDraft | null) => void;
}) {
  const [list, setList] = useState<ExperienceOption[]>([]);
  const [experienceId, setExperienceId] = useState("");
  const [form, setForm] = useState<ConfirmationCopyForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<ConfirmationCopyForm>(emptyForm);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingExp, setLoadingExp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const emitDraft = useCallback((nextTitle: string, nextForm: ConfirmationCopyForm) => {
    onDraftChangeRef.current({
      experienceTitle: nextTitle || "Your trip",
      logistics: logisticsFromCopyForm(nextForm),
    });
  }, []);

  useEffect(() => {
    fetch("/api/admin/experiences", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load listings");
        return Array.isArray(data) ? (data as ExperienceOption[]) : [];
      })
      .then((items) => {
        setList(items);
        if (items.length > 0) setExperienceId(items[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load listings"))
      .finally(() => setLoadingList(false));
  }, []);

  const loadExperience = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoadingExp(true);
      setError(null);
      setSaveMessage(null);
      try {
        const res = await fetch(`/api/admin/experiences/${encodeURIComponent(id)}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load listing");
        const nextForm = confirmationCopyFormFromExperience(data);
        const nextTitle = typeof data.title === "string" ? data.title : "";
        const nextUpdatedAt = typeof data.updatedAt === "number" ? data.updatedAt : null;
        setForm(nextForm);
        setSavedForm(nextForm);
        setTitle(nextTitle);
        setUpdatedAt(nextUpdatedAt);
        emitDraft(nextTitle, nextForm);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load listing");
        onDraftChangeRef.current(null);
      } finally {
        setLoadingExp(false);
      }
    },
    [emitDraft]
  );

  useEffect(() => {
    if (!experienceId) return;
    void loadExperience(experienceId);
  }, [experienceId, loadExperience]);

  function update<K extends keyof ConfirmationCopyForm>(key: K, value: ConfirmationCopyForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      emitDraft(title, next);
      return next;
    });
    setSaveMessage(null);
  }

  async function handleExperienceChange(id: string) {
    if (dirty && !window.confirm("You have unsaved confirmation copy. Switch listings anyway?")) return;
    setExperienceId(id);
  }

  async function handleSave() {
    if (!experienceId) return;
    if (updatedAt == null) {
      setError("This listing is missing a revision token. Open it under Listings, save once, then edit copy here.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const whatToBring = form.whatToBringText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const res = await fetchAdminPatchWithForceRetry(`/api/admin/experiences/${encodeURIComponent(experienceId)}`, {
        location: {
          title: form.locationTitle,
          addressText: form.locationAddress,
          notes: form.locationNotes || undefined,
        },
        confirmationEmail: parseConfirmationEmail({
          entranceFeeText: form.entranceFeeText,
          arrivalInstructions: form.arrivalInstructions,
          rulesText: form.rulesText,
          gratuityText: form.gratuityText,
          additionalNotes: form.additionalNotes,
        }),
        whatToBring,
        lastKnownUpdatedAt: updatedAt,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      }
      await loadExperience(experienceId);
      setSaveMessage("Saved. Future confirmation and reminder emails for this listing will use this copy.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-brand-dark/10 px-5 py-4 sm:px-6">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="email-copy-listing" className="sr-only">
            Listing
          </label>
          <select
            id="email-copy-listing"
            value={experienceId}
            onChange={(e) => void handleExperienceChange(e.target.value)}
            disabled={loadingList}
            className="w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2.5 text-sm font-semibold text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            {loadingList ? <option>Loading listings…</option> : null}
            {list.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.title || exp.id}
                {exp.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        {experienceId ? (
          <Link
            href={`/admin/experiences/${encodeURIComponent(experienceId)}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline"
          >
            Full listing
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving || loadingExp || !experienceId || !dirty}
          className="ml-auto"
        >
          <Save className="mr-1.5 h-4 w-4" aria-hidden />
          {saving ? "Saving…" : "Save copy"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {saveMessage && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saveMessage}
          </div>
        )}
        {dirty && !loadingExp ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            Unsaved draft — the preview on the right shows these edits. Save to use them in real emails.
          </p>
        ) : null}

        {list.length === 0 && !loadingList ? (
          <p className="text-sm text-brand-muted">No listings yet. Create one under Listings first.</p>
        ) : loadingExp ? (
          <p className="text-sm text-brand-muted">Loading copy…</p>
        ) : (
          <>
            <FieldGroup
              icon={<MapPin className="h-4 w-4 text-brand-primary" aria-hidden />}
              title="Pickup"
              hint="Where this experience meets. Different listings can use different docks."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pickup location" htmlFor="ce-pickup">
                  <input
                    id="ce-pickup"
                    className={inputClass}
                    value={form.locationTitle}
                    onChange={(e) => update("locationTitle", e.target.value)}
                    placeholder="e.g. Walsh Boat Ramp"
                  />
                </Field>
                <Field label="Pickup address" htmlFor="ce-address">
                  <input
                    id="ce-address"
                    className={inputClass}
                    value={form.locationAddress}
                    onChange={(e) => update("locationAddress", e.target.value)}
                    placeholder="Street address"
                  />
                </Field>
                <Field label="Location notes" htmlFor="ce-loc-notes" className="sm:col-span-2">
                  <textarea
                    id="ce-loc-notes"
                    rows={2}
                    className={textareaClass}
                    value={form.locationNotes}
                    onChange={(e) => update("locationNotes", e.target.value)}
                    placeholder="Parking, dock instructions, or other location notes"
                  />
                </Field>
                <Field label="Entrance / parking fee" htmlFor="ce-fee" className="sm:col-span-2">
                  <textarea
                    id="ce-fee"
                    rows={2}
                    className={textareaClass}
                    value={form.entranceFeeText}
                    onChange={(e) => update("entranceFeeText", e.target.value)}
                    placeholder="Leave blank if this listing has no fee"
                  />
                </Field>
              </div>
            </FieldGroup>

            <FieldGroup title="Before you go" hint="Blank fields are omitted from the email.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Arrival instructions" htmlFor="ce-arrival">
                  <textarea
                    id="ce-arrival"
                    rows={3}
                    className={textareaClass}
                    value={form.arrivalInstructions}
                    onChange={(e) => update("arrivalInstructions", e.target.value)}
                  />
                </Field>
                <Field label="Rules / reminders" htmlFor="ce-rules">
                  <textarea
                    id="ce-rules"
                    rows={3}
                    className={textareaClass}
                    value={form.rulesText}
                    onChange={(e) => update("rulesText", e.target.value)}
                  />
                </Field>
                <Field label="Gratuity note" htmlFor="ce-gratuity">
                  <textarea
                    id="ce-gratuity"
                    rows={3}
                    className={textareaClass}
                    value={form.gratuityText}
                    onChange={(e) => update("gratuityText", e.target.value)}
                  />
                </Field>
                <Field label="What to bring" htmlFor="ce-bring">
                  <textarea
                    id="ce-bring"
                    rows={3}
                    className={textareaClass}
                    value={form.whatToBringText}
                    onChange={(e) => update("whatToBringText", e.target.value)}
                    placeholder="One item per line"
                  />
                </Field>
                <Field label="Additional instructions" htmlFor="ce-extra" className="sm:col-span-2">
                  <textarea
                    id="ce-extra"
                    rows={3}
                    className={textareaClass}
                    value={form.additionalNotes}
                    onChange={(e) => update("additionalNotes", e.target.value)}
                    placeholder="Anything else for this trip"
                  />
                </Field>
              </div>
            </FieldGroup>
          </>
        )}
      </div>
    </section>
  );
}

function FieldGroup({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
          {icon}
          {title}
        </h3>
        {hint ? <p className="mt-0.5 text-xs text-brand-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wider text-brand-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
