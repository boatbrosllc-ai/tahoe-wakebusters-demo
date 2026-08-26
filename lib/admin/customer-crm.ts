/**
 * Shared helpers for the admin customers/leads CRM (list merge, profile activity, outbound email).
 */

import { isValidBookingEmail } from "@/lib/booking/validate-email";

export const CRM_LAPSED_AFTER_MS = 365 * 24 * 60 * 60 * 1000;
export const CRM_EMAIL_SUBJECT_MAX = 200;
export const CRM_EMAIL_BODY_MAX = 10_000;
export const CRM_PROFILE_BOOKING_LIMIT = 100;
export const CRM_PROFILE_ACTIVITY_LIMIT = 200;
export const CRM_LEAD_LIST_LIMIT = 300;

export type CustomerKind = "lead" | "customer";
export type CustomerSegment = "all" | "customers" | "leads" | "repeat" | "lapsed";

export type CustomerListItem = {
  email: string;
  name: string;
  phone: string;
  bookingCount: number;
  lastBookingAt: string | null;
  totalSpentCents: number;
  kind: CustomerKind;
  marketingOptIn: boolean;
  lastExperienceName: string | null;
  leadSource: string | null;
  leadCapturedAt: string | null;
  leadInterest: string | null;
  leadPage: string | null;
  lastContactedAt: string | null;
  leadMessage: string | null;
};

export type CustomerActivityType =
  | "lead_captured"
  | "booking_created"
  | "marketing_opt_in"
  | "email"
  | "sms";

export type CustomerActivityItem = {
  id: string;
  type: CustomerActivityType;
  at: string;
  title: string;
  detail?: string | null;
  bookingId?: string | null;
  channel?: "email" | "sms" | null;
};

export type ParsedAdminCrmEmail = {
  to: string;
  toName: string;
  subject: string;
  body: string;
};

export function normalizeCustomerEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Distinct casings to query in Firestore (`customer.email` / `emailLog.to` are stored as entered). */
export function emailLookupVariants(email: string): string[] {
  const trimmed = email.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  return trimmed === lower ? [trimmed] : [trimmed, lower];
}

export function customerKindFromBookingCount(bookingCount: number): CustomerKind {
  return bookingCount > 0 ? "customer" : "lead";
}

export function isLapsedCustomer(lastBookingAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastBookingAt) return false;
  const t = Date.parse(lastBookingAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t >= CRM_LAPSED_AFTER_MS;
}

export function customerProfilePath(email: string): string {
  return `/admin/customers/${encodeURIComponent(email.trim())}`;
}

export function customerStatusLabel(
  item: Pick<CustomerListItem, "kind" | "bookingCount" | "lastBookingAt"> & { lastContactedAt?: string | null }
): string {
  if (item.kind === "lead" || item.bookingCount <= 0) {
    return item.lastContactedAt ? "Contacted" : "Lead";
  }
  if (item.bookingCount > 1) return "Repeat";
  if (isLapsedCustomer(item.lastBookingAt)) return "Lapsed";
  return "Customer";
}

export function matchesCustomerSegment(
  item: CustomerListItem,
  segment: CustomerSegment,
  nowMs = Date.now()
): boolean {
  switch (segment) {
    case "customers":
      return item.kind === "customer";
    case "leads":
      return item.kind === "lead";
    case "repeat":
      return item.bookingCount > 1;
    case "lapsed":
      return item.kind === "customer" && isLapsedCustomer(item.lastBookingAt, nowMs);
    default:
      return true;
  }
}

function preferNonEmpty(next: string, prev: string): string {
  const n = next.trim();
  return n ? n : prev;
}

export function emptyLeadListItem(opts: {
  email: string;
  name?: string | null;
  phone?: string | null;
  source?: string | null;
  capturedAt?: string | null;
  interest?: string | null;
  page?: string | null;
  lastContactedAt?: string | null;
  message?: string | null;
}): CustomerListItem {
  return {
    email: opts.email.trim(),
    name: opts.name?.trim() || "",
    phone: opts.phone?.trim() || "",
    bookingCount: 0,
    lastBookingAt: null,
    totalSpentCents: 0,
    kind: "lead",
    marketingOptIn: true,
    lastExperienceName: null,
    leadSource: opts.source?.trim() || null,
    leadCapturedAt: opts.capturedAt ?? null,
    leadInterest: opts.interest?.trim() || null,
    leadPage: opts.page?.trim() || null,
    lastContactedAt: opts.lastContactedAt ?? null,
    leadMessage: opts.message?.trim() || null,
  };
}

/** Merge booking-page aggregates and/or leads keyed by normalized email. */
export function mergeCustomerRecords(prev: CustomerListItem[], batch: CustomerListItem[]): CustomerListItem[] {
  const m = new Map<string, CustomerListItem>();
  for (const row of prev) {
    const key = normalizeCustomerEmail(row.email);
    if (!key) continue;
    m.set(key, { ...row, kind: customerKindFromBookingCount(row.bookingCount) });
  }
  for (const c of batch) {
    const key = normalizeCustomerEmail(c.email);
    if (!key) continue;
    const e = m.get(key);
    if (!e) {
      m.set(key, { ...c, kind: customerKindFromBookingCount(c.bookingCount) });
      continue;
    }
    const cNewer = Boolean(c.lastBookingAt && (!e.lastBookingAt || c.lastBookingAt > e.lastBookingAt));
    const cLeadNewer = Boolean(
      !c.lastBookingAt &&
        !e.lastBookingAt &&
        c.leadCapturedAt &&
        (!e.leadCapturedAt || c.leadCapturedAt > e.leadCapturedAt)
    );
    const newer = cNewer || cLeadNewer;
    const last =
      !e.lastBookingAt ? c.lastBookingAt
      : !c.lastBookingAt ? e.lastBookingAt
      : e.lastBookingAt > c.lastBookingAt ? e.lastBookingAt : c.lastBookingAt;
    const bookingCount = e.bookingCount + c.bookingCount;
    const leadCapturedAt =
      !e.leadCapturedAt ? c.leadCapturedAt
      : !c.leadCapturedAt ? e.leadCapturedAt
      : e.leadCapturedAt < c.leadCapturedAt ? e.leadCapturedAt : c.leadCapturedAt;
    const lastContactedAt =
      !e.lastContactedAt ? c.lastContactedAt
      : !c.lastContactedAt ? e.lastContactedAt
      : e.lastContactedAt > c.lastContactedAt ? e.lastContactedAt : c.lastContactedAt;
    m.set(key, {
      email: e.email || c.email,
      name: newer ? preferNonEmpty(c.name, e.name) : preferNonEmpty(e.name, c.name),
      phone: newer ? preferNonEmpty(c.phone, e.phone) : preferNonEmpty(e.phone, c.phone),
      bookingCount,
      totalSpentCents: e.totalSpentCents + c.totalSpentCents,
      lastBookingAt: last,
      kind: customerKindFromBookingCount(bookingCount),
      marketingOptIn: Boolean(e.marketingOptIn || c.marketingOptIn),
      lastExperienceName: cNewer
        ? c.lastExperienceName || e.lastExperienceName
        : e.lastExperienceName || c.lastExperienceName,
      leadSource: e.leadSource || c.leadSource,
      leadCapturedAt,
      leadInterest: newer ? c.leadInterest || e.leadInterest : e.leadInterest || c.leadInterest,
      leadPage: newer ? c.leadPage || e.leadPage : e.leadPage || c.leadPage,
      lastContactedAt,
      leadMessage: newer ? c.leadMessage || e.leadMessage : e.leadMessage || c.leadMessage,
    });
  }
  return Array.from(m.values()).sort((a, b) => {
    const aAt = a.lastBookingAt || a.leadCapturedAt || "";
    const bAt = b.lastBookingAt || b.leadCapturedAt || "";
    return bAt.localeCompare(aAt);
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function adminCrmEmailToHtml(body: string): string {
  const escaped = escapeHtml(body.trim());
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;background:#f6f3ee;padding:24px;color:#1a2e35;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
    <p style="margin:0 0 20px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#0f766e;">Slipstack</p>
    ${paragraphs}
    <p style="margin:28px 0 0;font-size:12px;color:#6b7280;">— Slipstack</p>
  </div>
</body></html>`;
}

export function parseAdminCrmEmailBody(body: unknown): ParsedAdminCrmEmail | { error: string } {
  if (body == null || typeof body !== "object") return { error: "Request body must be a JSON object." };
  const o = body as Record<string, unknown>;
  const to = typeof o.to === "string" ? normalizeCustomerEmail(o.to) : "";
  const toName = typeof o.toName === "string" ? o.toName.trim().slice(0, 120) : "";
  const subject = typeof o.subject === "string" ? o.subject.trim().replace(/\s+/g, " ") : "";
  const text = typeof o.body === "string" ? o.body.trim() : "";
  if (!to || !isValidBookingEmail(to)) return { error: "A valid recipient email is required." };
  if (!subject) return { error: "Subject is required." };
  if (subject.length > CRM_EMAIL_SUBJECT_MAX) return { error: `Subject must be at most ${CRM_EMAIL_SUBJECT_MAX} characters.` };
  if (!text) return { error: "Message body is required." };
  if (text.length > CRM_EMAIL_BODY_MAX) return { error: `Message must be at most ${CRM_EMAIL_BODY_MAX} characters.` };
  return { to, toName, subject, body: text };
}

const EMAIL_ACTIVITY_TITLES: Record<string, string> = {
  booking_confirmation: "Confirmation email",
  booking_reminder_1week: "1-week reminder",
  booking_reminder_24h: "24-hour reminder",
  booking_reminder_dayof: "Day-of reminder",
  final_payment_request: "Final payment request",
  final_charge_success: "Final payment confirmation",
  booking_cancellation: "Cancellation email",
  final_charge_failed: "Final charge failed email",
  waiver_invite: "Waiver invite",
  waiver_reminder: "Waiver reminder",
  admin_crm_email: "Email from admin",
  discount_limit_exceeded_notification: "Discount limit email",
};

export function activityTitleForEmailLog(templateId: string, channel?: string | null): string {
  const known = EMAIL_ACTIVITY_TITLES[templateId];
  if (known) return channel === "sms" ? known.replace(/email/i, "SMS") : known;
  if (channel === "sms") return "SMS";
  return templateId.replace(/_/g, " ") || "Email";
}

export function sortActivityNewestFirst(items: CustomerActivityItem[]): CustomerActivityItem[] {
  return [...items].sort((a, b) => {
    const cmp = (b.at || "").localeCompare(a.at || "");
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });
}
