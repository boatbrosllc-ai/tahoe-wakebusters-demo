"use client";

import React, { useId } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Plus, Trash2, FileText, Mail, Send, Bell, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export type RequiredFields = {
  dob: boolean;
  phone: boolean;
  address: boolean;
  bookingDate: boolean;
};

export type Clause = { id: string; label: string; requiresInitials: boolean };

export type SignatureConfig = {
  mode: "draw" | "type" | "both";
  requireTypedName: boolean;
};

export type PageHeading = { title: string; heading: string; subheading: string };

const DEFAULT_PAGE_HEADINGS: Record<string, PageHeading> = {
  welcome: { title: "Welcome", heading: "Hi", subheading: "Welcome to Boat Bros' Online Waiver!" },
  tripDate: { title: "Trip Date", heading: "Please enter the date you booked for", subheading: "" },
  name: { title: "Name", heading: "Please enter your First and Last name", subheading: "" },
  dob: { title: "Date of Birth", heading: "Please enter your Date of Birth", subheading: "" },
  phone: { title: "Phone", heading: "Please enter your phone number", subheading: "" },
  address: { title: "Address", heading: "Please enter your address", subheading: "" },
  guardian: { title: "Guardian Name", heading: "Please enter the First and Last name of your guardian", subheading: "Typically displayed if the guest is a minor." },
  clauses: { title: "Acknowledgements", heading: "Please initial the following", subheading: "" },
  terms: { title: "Terms and Conditions", heading: "Terms and conditions", subheading: "Please read and accept below." },
  signature: { title: "Signature", heading: "Sign below", subheading: "" },
};

export interface WaiverTemplateFormValues {
  title: string;
  description: string;
  isActive: boolean;
  termsHtml: string;
  requiredFields: RequiredFields;
  clauses: Clause[];
  signature: SignatureConfig;
  welcomeHeading: string;
  welcomeSubheading: string;
  pageHeadings: Record<string, PageHeading>;
  dobMinAge: number;
  dobMaxAge: number;
  minorAge: number;
  includeInConfirmationEmail: boolean;
  sendSeparateWaiverInvite: boolean;
  sendWaiverReminder: boolean;
}

const DEFAULT_REQUIRED: RequiredFields = {
  dob: true,
  phone: true,
  address: false,
  bookingDate: true,
};

const DEFAULT_SIGNATURE: SignatureConfig = {
  mode: "both",
  requireTypedName: true,
};

/** Escape HTML for safe insertion into generated markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert plain-text terms to HTML. Paragraphs separated by blank lines.
 * Lines starting with "- " or "* " become bullet points.
 */
export function plainTextToTermsHtml(plain: string): string {
  const trimmed = plain.trim();
  if (!trimmed) return "";
  const blocks = trimmed.split(/\n\n+/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split(/\n/).map((l) => l.trimEnd());
    const bulletLines = lines.filter((l) => /^[-*]\s/.test(l) || l.startsWith("-") || l.startsWith("*"));
    if (bulletLines.length > 0 && bulletLines.length === lines.length) {
      const items = bulletLines.map((l) => l.replace(/^[-*]\s*/, ""));
      out.push("<ul>\n" + items.map((i) => "  <li>" + escapeHtml(i) + "</li>").join("\n") + "\n</ul>");
    } else {
      const para = lines.join(" ");
      if (para) out.push("<p>" + escapeHtml(para) + "</p>");
    }
  }
  return out.join("\n");
}

/**
 * Convert stored HTML back to plain text for editing (paragraphs and - bullets).
 */
export function termsHtmlToPlainText(html: string): string {
  if (!html || !html.trim()) return "";
  const decoded = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
  const withNewlines = decoded
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?ul[^>]*>/gi, "\n")
    .replace(/<\/?ol[^>]*>/gi, "\n");
  const stripped = withNewlines.replace(/<[^>]+>/g, "").trim();
  return stripped.replace(/\n{3,}/g, "\n\n").replace(/\n\s*\n/g, "\n\n").trim();
}

const TERMS_PLACEHOLDER = `Paste or edit terms here. Use a blank line for new paragraphs; start a line with "- " for bullets.`;

/** Default Boat Bros LLC waiver terms (plain text). Used for new templates. */
const BOAT_BROS_TERMS_PLAINTEXT = `PARTICIPANT AGREEMENT, RELEASE AND ASSUMPTION OF RISK

In consideration of the services Boat Bros LLC, their agents, owners, officers, volunteers, employees, and all other persons or entities acting in any capacity on their behalf (hereinafter collectively referred to as "BB"), I hereby agree to release, indemnify, and discharge BB, on behalf of myself, my spouse, my children, my parents, my heirs, assigns, personal representative and estate as follows:

1. Acknowledgement and Assumption of Risk

I acknowledge that my participation in guided pontoon boat tours and boating activities entails known and unanticipated risks that could result in physical or emotional injury, paralysis, death, or damage to myself, to property, or to third parties. I understand that such risks simply cannot be eliminated without jeopardizing the essential qualities of the activity.

The risks include, among other things:

- Slips and falls
- Accidental drowning
- Boat or watercraft may capsize and cause entrapment
- Collision with objects or other watercraft
- Rapidly changing adverse weather and water conditions including surf and currents
- Watercraft is slippery when wet and accidents can occur getting in or out
- Exposure to outdoor elements which could cause: Cold water shock, Hypothermia, Hyperthermia (heat related illnesses), Heat exhaustion, Sunburn, Dehydration
- Exposure to dangerous wild animals, insect bites, and hazardous plant life
- Aggressive and/or poisonous marine life
- Passengers can be jolted, jarred, bounced, thrown about and otherwise shaken during rides
- Passengers can be thrown off the machine resulting in: Strains, Sprains, Broken bones, Musculoskeletal injuries including head, neck, and back injuries, Cuts, abrasions, and bruises
- Negligence of participants or others present
- Equipment failure or operator error
- Accidents involving other vehicles, vessels, or watercraft
- Transmissible pathogen or disease
- Accidents or illness occurring in remote places without medical facilities
- My own physical condition and the physical exertion associated with this activity

Furthermore, BB personnel have difficult jobs to perform. They seek safety but are not infallible. They may:

- Be unaware of a participant's fitness or abilities
- Misjudge weather or environmental conditions
- Give incomplete warnings or instructions
- Experience equipment malfunction

2. Voluntary Participation and Life Jacket Requirement

I expressly agree and promise to accept and assume all of the risks existing in this activity. My participation in this activity is purely voluntary, and I elect to participate in spite of the risks.

Additionally, I agree to wear a U.S. Coast Guard approved personal flotation device (life jacket) while participating in this activity.

3. Release, Indemnity, and Hold Harmless Agreement

I hereby voluntarily release, forever discharge and agree to indemnify and hold harmless BB from any and all claims, demands, or causes of action based upon or arising out of injuries, including death, to persons, or damages to or destruction of property, sustained or alleged to have been sustained in connection with, arising out of, or in any way related to my participation in this activity or my use of BB's equipment or facilities.

This includes claims which are based or founded, in whole or in part, upon the alleged negligent acts or omissions of BB.

4. Attorney's Fees and Enforcement

Should BB or anyone acting on their behalf be required to incur attorney's fees and costs to enforce this agreement, I agree to indemnify and hold them harmless for all such fees and costs.

5. Insurance and Medical Responsibility

I certify that:

- I have adequate insurance to cover any injury or damage I may cause or suffer while participating, OR
- I agree to bear the costs of such injury or damage myself

I further certify that I am willing to assume the risk of any medical or physical condition I may have.

6. Governing Law and Venue

In the event that I file a lawsuit against BB, I agree to do so solely in the state of Texas.

I further agree that the substantive law of Texas shall apply in that action without regard to conflict of law rules.

I agree that if any portion of this agreement is found to be void or unenforceable, the remaining document shall remain in full force and effect.

Acknowledgment of Waiver and Legal Rights

By signing this document, I acknowledge that if anyone is hurt or property is damaged during my participation in this activity, I may be found by a court of law to have waived my right to maintain a lawsuit against BB on the basis of any claim from which I have released them herein.

I also agree that this document is valid for subsequent visits and participation at BB.

I have had sufficient opportunity to read this entire document. I have read and understood it, and I agree to be bound by its terms.`;

function generateClauseId(): string {
  return "c-" + Math.random().toString(36).slice(2, 11);
}

interface WaiverTemplateFormProps {
  value: WaiverTemplateFormValues;
  onChange: (value: WaiverTemplateFormValues) => void;
  onSubmit: (e: React.FormEvent) => void;
  isNew?: boolean;
  saving?: boolean;
  error?: string | null;
  submitLabel?: string;
  cancelHref?: string;
}

export function WaiverTemplateForm({
  value,
  onChange,
  onSubmit,
  isNew = false,
  saving = false,
  error = null,
  submitLabel,
  cancelHref,
}: WaiverTemplateFormProps) {
  const baseId = useId();

  const update = (patch: Partial<WaiverTemplateFormValues>) => {
    onChange({ ...value, ...patch });
  };

  const addClause = () => {
    update({
      clauses: [...value.clauses, { id: generateClauseId(), label: "", requiresInitials: true }],
    });
  };

  const updateClause = (index: number, patch: Partial<Clause>) => {
    const next = [...value.clauses];
    next[index] = { ...next[index], ...patch };
    update({ clauses: next });
  };

  const removeClause = (index: number) => {
    update({ clauses: value.clauses.filter((_, i) => i !== index) });
  };

  const moveClause = (index: number, dir: -1 | 1) => {
    const i = index + dir;
    if (i < 0 || i >= value.clauses.length) return;
    const next = [...value.clauses];
    [next[index], next[i]] = [next[i], next[index]];
    update({ clauses: next });
  };

  const inputClass =
    "w-full rounded-xl border border-brand-dark/15 px-3.5 py-2.5 text-sm text-brand-dark placeholder:text-brand-muted/80 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-shadow";
  const labelClass = "block text-sm font-medium text-brand-dark mb-1.5";

  const updatePageHeading = (key: string, patch: Partial<PageHeading>) => {
    update({
      pageHeadings: {
        ...value.pageHeadings,
        [key]: { ...value.pageHeadings[key], ...patch },
      },
    });
  };
  const getPage = (key: keyof typeof value.pageHeadings) => value.pageHeadings[key] ?? DEFAULT_PAGE_HEADINGS[key];

  const PageCard = ({
    pageKey,
    label,
    children,
  }: {
    pageKey: keyof typeof value.pageHeadings;
    label: string;
    children: React.ReactNode;
  }) => {
    const p = getPage(pageKey);
    return (
      <Card className="overflow-hidden rounded-2xl border border-brand-dark/10 shadow-sm">
        <div className="flex items-center gap-3 bg-brand-bg/40 px-4 py-3 border-b border-brand-dark/10">
          <div className="h-8 w-1 rounded-full bg-brand-primary/60" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Page</span>
          <span className="text-sm font-medium text-brand-dark">{label}</span>
        </div>
        <CardContent className="pt-4 space-y-3">
          <div>
            <label className={labelClass}>Title (internal use)</label>
            <input
              type="text"
              value={p.title}
              onChange={(e) => updatePageHeading(pageKey, { title: e.target.value })}
              className={inputClass}
              placeholder="e.g. Welcome"
            />
          </div>
          <div>
            <label className={labelClass}>Heading</label>
            <input
              type="text"
              value={p.heading}
              onChange={(e) => updatePageHeading(pageKey, { heading: e.target.value })}
              className={inputClass}
              placeholder="Shown to the guest"
            />
          </div>
          <div>
            <label className={labelClass}>Subheading</label>
            <input
              type="text"
              value={p.subheading}
              onChange={(e) => updatePageHeading(pageKey, { subheading: e.target.value })}
              className={inputClass}
              placeholder="Optional"
            />
          </div>
          {children}
        </CardContent>
      </Card>
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && (
        <div className="rounded-xl bg-red-50 text-red-800 px-4 py-3 text-sm border border-red-200" role="alert">
          {error}
        </div>
      )}

      <Card className="rounded-2xl border border-brand-dark/10 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-primary/80" aria-hidden />
            <CardTitle className="text-base font-semibold">Template (internal)</CardTitle>
          </div>
          <CardDescription>Name and visibility. Not shown to guests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor={`${baseId}-title`} className={labelClass}>
              Template title *
            </label>
            <input
              id={`${baseId}-title`}
              type="text"
              value={value.title}
              onChange={(e) => update({ title: e.target.value })}
              required
              className={inputClass}
              placeholder="e.g. Standard boat charter waiver"
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-description`} className={labelClass}>
              Internal description
            </label>
            <input
              id={`${baseId}-description`}
              type="text"
              value={value.description}
              onChange={(e) => update({ description: e.target.value })}
              className={inputClass}
              placeholder="Optional note for your team"
            />
          </div>
          {!isNew && (
            <label className="flex items-center gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={value.isActive}
                onChange={(e) => update({ isActive: e.target.checked })}
                className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              />
              <span className="text-sm text-brand-dark">Active (use for new bookings)</span>
            </label>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-brand-dark/10 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-brand-primary/80" aria-hidden />
            <CardTitle className="text-base font-semibold">Send waiver in</CardTitle>
          </div>
          <CardDescription>One combined email is recommended. Optionally send an extra waiver-only email.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label
              className={cn(
                "flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all",
                value.includeInConfirmationEmail
                  ? "border-brand-primary bg-brand-primary/5"
                  : "border-brand-dark/10 hover:border-brand-dark/20 hover:bg-brand-bg/50"
              )}
            >
              <div className="flex items-center justify-between">
                <Mail className="h-5 w-5 text-brand-primary/80" aria-hidden />
                <input
                  type="checkbox"
                  checked={value.includeInConfirmationEmail}
                  onChange={(e) => update({ includeInConfirmationEmail: e.target.checked })}
                  className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary"
                />
              </div>
              <span className="text-sm font-medium text-brand-dark">Confirmation and Waiver</span>
              <span className="text-xs text-brand-muted">One email: booking details + waiver link (recommended)</span>
            </label>
            <label
              className={cn(
                "flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all",
                value.sendSeparateWaiverInvite
                  ? "border-brand-primary bg-brand-primary/5"
                  : "border-brand-dark/10 hover:border-brand-dark/20 hover:bg-brand-bg/50"
              )}
            >
              <div className="flex items-center justify-between">
                <Send className="h-5 w-5 text-brand-primary/80" aria-hidden />
                <input
                  type="checkbox"
                  checked={value.sendSeparateWaiverInvite}
                  onChange={(e) => update({ sendSeparateWaiverInvite: e.target.checked })}
                  className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary"
                />
              </div>
              <span className="text-sm font-medium text-brand-dark">Also send separate waiver email</span>
              <span className="text-xs text-brand-muted">Optional extra &quot;Sign your waiver&quot; email</span>
            </label>
            <label
              className={cn(
                "flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all",
                value.sendWaiverReminder
                  ? "border-brand-primary bg-brand-primary/5"
                  : "border-brand-dark/10 hover:border-brand-dark/20 hover:bg-brand-bg/50"
              )}
            >
              <div className="flex items-center justify-between">
                <Bell className="h-5 w-5 text-brand-primary/80" aria-hidden />
                <input
                  type="checkbox"
                  checked={value.sendWaiverReminder}
                  onChange={(e) => update({ sendWaiverReminder: e.target.checked })}
                  className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary"
                />
              </div>
              <span className="text-sm font-medium text-brand-dark">Reminder email</span>
              <span className="text-xs text-brand-muted">Include in automated reminder</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-brand-primary/80" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Pages</h2>
            <p className="text-sm text-brand-muted">Configure each screen guests see. Title is for your reference only.</p>
          </div>
        </div>
        <div className="space-y-4">
        <PageCard pageKey="welcome" label="Welcome">
          <p className="text-xs text-brand-muted">First screen. Use Heading and Subheading to greet the guest.</p>
        </PageCard>

        <PageCard pageKey="tripDate" label="Trip Date">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={value.requiredFields.bookingDate} onChange={(e) => update({ requiredFields: { ...value.requiredFields, bookingDate: e.target.checked } })} className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary" />
            <span className="text-sm text-brand-dark">Show booking date on waiver</span>
          </label>
        </PageCard>

        <PageCard pageKey="name" label="Name">
          <p className="text-xs text-brand-muted">Guest full name. Always collected. Required.</p>
        </PageCard>

        <PageCard pageKey="dob" label="Date of Birth">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={value.requiredFields.dob} onChange={(e) => update({ requiredFields: { ...value.requiredFields, dob: e.target.checked } })} className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary" />
            <span className="text-sm text-brand-dark">Collect date of birth</span>
          </label>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <label htmlFor={`${baseId}-dobMin`} className={labelClass}>Minimum age</label>
              <input id={`${baseId}-dobMin`} type="number" min={0} max={120} value={value.dobMinAge} onChange={(e) => update({ dobMinAge: parseInt(e.target.value, 10) || 0 })} className={inputClass} aria-label="Minimum age" />
            </div>
            <div>
              <label htmlFor={`${baseId}-dobMax`} className={labelClass}>Maximum age</label>
              <input id={`${baseId}-dobMax`} type="number" min={0} max={120} value={value.dobMaxAge} onChange={(e) => update({ dobMaxAge: parseInt(e.target.value, 10) || 100 })} className={inputClass} aria-label="Maximum age" />
            </div>
            <div>
              <label htmlFor={`${baseId}-minorAge`} className={labelClass}>Minor age (under)</label>
              <input id={`${baseId}-minorAge`} type="number" min={0} max={120} value={value.minorAge} onChange={(e) => update({ minorAge: parseInt(e.target.value, 10) || 18 })} className={inputClass} aria-label="Minor age under" />
            </div>
          </div>
        </PageCard>

        <PageCard pageKey="phone" label="Phone">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={value.requiredFields.phone} onChange={(e) => update({ requiredFields: { ...value.requiredFields, phone: e.target.checked } })} className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary" />
            <span className="text-sm text-brand-dark">Collect phone number</span>
          </label>
        </PageCard>

        <PageCard pageKey="address" label="Address">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={value.requiredFields.address} onChange={(e) => update({ requiredFields: { ...value.requiredFields, address: e.target.checked } })} className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary" />
            <span className="text-sm text-brand-dark">Collect address</span>
          </label>
        </PageCard>

        <PageCard pageKey="guardian" label="Guardian Name">
          <p className="text-xs text-brand-muted">Optional. Typically shown when guest is under the minor age.</p>
        </PageCard>

        <PageCard pageKey="clauses" label="Acknowledgements">
          <p className="text-xs text-brand-muted">Statements guests must initial.</p>
          {value.clauses.length === 0 ? (
            <p className="text-sm text-brand-muted py-2">
              No clauses yet. Add one if you want guests to initial specific statements.
            </p>
          ) : (
            value.clauses.map((clause, index) => (
              <div
                key={clause.id}
                className="flex items-start gap-3 p-4 rounded-xl border border-brand-dark/10 bg-brand-bg/30"
              >
                <div className="flex flex-col gap-0.5 pt-1.5">
                  <button
                    type="button"
                    onClick={() => moveClause(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-brand-muted hover:text-brand-dark disabled:opacity-30 rounded hover:bg-brand-dark/5"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveClause(index, 1)}
                    disabled={index === value.clauses.length - 1}
                    className="p-1 text-brand-muted hover:text-brand-dark disabled:opacity-30 rounded hover:bg-brand-dark/5"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    type="text"
                    value={clause.label}
                    onChange={(e) => updateClause(index, { label: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. I understand there are inherent risks"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clause.requiresInitials}
                      onChange={(e) => updateClause(index, { requiresInitials: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-brand-dark/30 text-brand-primary"
                    />
                    <span className="text-xs text-brand-muted">Require initials</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeClause(index)}
                  className="p-2 text-brand-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Remove clause"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
          <Button type="button" variant="outline" size="sm" onClick={addClause} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add clause
          </Button>
        </PageCard>

        <PageCard pageKey="terms" label="Terms and Conditions">
          <p className="text-xs text-brand-muted">Plain text. Blank line = new paragraph. Line starting with &quot;- &quot; = bullet.</p>
          <textarea
            value={termsHtmlToPlainText(value.termsHtml)}
            onChange={(e) => update({ termsHtml: plainTextToTermsHtml(e.target.value) })}
            rows={12}
            className={cn(inputClass, "min-h-[240px] resize-y")}
            placeholder={TERMS_PLACEHOLDER}
          />
        </PageCard>

        <PageCard pageKey="signature" label="Signature">
          <div className="space-y-3">
            <p className={labelClass}>Signature method</p>
            <div className="flex flex-wrap gap-4">
              {[
                { value: "draw" as const, label: "Draw only" },
                { value: "type" as const, label: "Type only" },
                { value: "both" as const, label: "Draw and type (recommended)" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={`${baseId}-mode`} checked={value.signature.mode === opt.value} onChange={() => update({ signature: { ...value.signature, mode: opt.value } })} className="h-4 w-4 text-brand-primary focus:ring-brand-primary" />
                  <span className="text-sm text-brand-dark">{opt.label}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={value.signature.requireTypedName} onChange={(e) => update({ signature: { ...value.signature, requireTypedName: e.target.checked } })} className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary" />
            <span className="text-sm text-brand-dark">Require typed full name</span>
          </label>
        </div>
        </PageCard>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-brand-dark/10">
        <Button type="submit" disabled={saving} className="min-h-[44px] px-6">
          {saving ? "Saving…" : submitLabel ?? (isNew ? "Create template" : "Save (new version)")}
        </Button>
        {cancelHref && (
          <Button type="button" variant="outline" asChild className="min-h-[44px]">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}

export const defaultWaiverTemplateFormValues: WaiverTemplateFormValues = {
  title: "",
  description: "",
  isActive: true,
  termsHtml: plainTextToTermsHtml(BOAT_BROS_TERMS_PLAINTEXT),
  requiredFields: DEFAULT_REQUIRED,
  clauses: [],
  signature: DEFAULT_SIGNATURE,
  welcomeHeading: DEFAULT_PAGE_HEADINGS.welcome.heading,
  welcomeSubheading: DEFAULT_PAGE_HEADINGS.welcome.subheading,
  pageHeadings: { ...DEFAULT_PAGE_HEADINGS },
  dobMinAge: 3,
  dobMaxAge: 100,
  minorAge: 18,
  includeInConfirmationEmail: true,
  sendSeparateWaiverInvite: false,
  sendWaiverReminder: true,
};

export function formValuesToPayload(
  v: WaiverTemplateFormValues
): {
  title: string;
  description: string;
  isActive: boolean;
  termsHtml: string;
  requiredFields: RequiredFields;
  clauses: { id: string; label: string; requiresInitials: boolean }[];
  signature: SignatureConfig;
  welcomeHeading?: string;
  welcomeSubheading?: string;
  pageHeadings?: Record<string, PageHeading>;
  dobMinAge?: number;
  dobMaxAge?: number;
  minorAge?: number;
  includeInConfirmationEmail?: boolean;
  sendSeparateWaiverInvite?: boolean;
  sendWaiverReminder?: boolean;
} {
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    isActive: v.isActive,
    termsHtml: v.termsHtml.trim() || "<p>Terms and conditions.</p>",
    requiredFields: v.requiredFields,
    clauses: v.clauses
      .filter((c) => c.label.trim())
      .map((c) => ({ id: c.id, label: c.label.trim(), requiresInitials: c.requiresInitials })),
    signature: v.signature,
    welcomeHeading: v.welcomeHeading.trim() || undefined,
    welcomeSubheading: v.welcomeSubheading.trim() || undefined,
    pageHeadings: v.pageHeadings,
    dobMinAge: v.dobMinAge,
    dobMaxAge: v.dobMaxAge,
    minorAge: v.minorAge,
    includeInConfirmationEmail: v.includeInConfirmationEmail,
    sendSeparateWaiverInvite: v.sendSeparateWaiverInvite,
    sendWaiverReminder: v.sendWaiverReminder,
  };
}

export function templateToFormValues(t: {
  title?: string;
  description?: string;
  isActive?: boolean;
  termsHtml?: string;
  requiredFields?: RequiredFields;
  clauses?: Clause[];
  signature?: SignatureConfig;
  welcomeHeading?: string;
  welcomeSubheading?: string;
  pageHeadings?: Record<string, PageHeading>;
  dobMinAge?: number;
  dobMaxAge?: number;
  minorAge?: number;
  includeInConfirmationEmail?: boolean;
  sendSeparateWaiverInvite?: boolean;
  sendWaiverReminder?: boolean;
}): WaiverTemplateFormValues {
  const pageHeadings = { ...DEFAULT_PAGE_HEADINGS, ...(t.pageHeadings ?? {}) };
  return {
    title: t.title ?? "",
    description: t.description ?? "",
    isActive: t.isActive ?? true,
    termsHtml: t.termsHtml ?? "",
    requiredFields: t.requiredFields ?? DEFAULT_REQUIRED,
    clauses: t.clauses ?? [],
    signature: t.signature ?? DEFAULT_SIGNATURE,
    welcomeHeading: t.welcomeHeading ?? DEFAULT_PAGE_HEADINGS.welcome.heading,
    welcomeSubheading: t.welcomeSubheading ?? DEFAULT_PAGE_HEADINGS.welcome.subheading,
    pageHeadings,
    dobMinAge: t.dobMinAge ?? 3,
    dobMaxAge: t.dobMaxAge ?? 100,
    minorAge: t.minorAge ?? 18,
    includeInConfirmationEmail: t.includeInConfirmationEmail ?? true,
    sendSeparateWaiverInvite: t.sendSeparateWaiverInvite ?? false,
    sendWaiverReminder: t.sendWaiverReminder ?? true,
  };
}
