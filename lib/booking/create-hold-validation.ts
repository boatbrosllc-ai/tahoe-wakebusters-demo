/**
 * create-hold request body parsing — pure validation for unit tests and the API route.
 */

import type { CreateHoldInput } from "@/lib/booking/types";
import { validatePhone } from "@/lib/booking/validate-phone";
import { BOOKING_EMAIL_REGEX } from "@/lib/booking/validate-email";

export type ParseCreateHoldBodyResult =
  | { input: CreateHoldInput; hint?: string }
  | { input: null; hint: string };

/**
 * Parse and validate JSON body for POST /api/booking/create-hold.
 */
export function parseCreateHoldBody(body: unknown): ParseCreateHoldBodyResult {
  if (body == null || typeof body !== "object") {
    return { input: null, hint: "Request body must be a JSON object." };
  }
  const o = body as Record<string, unknown>;
  const boatId = typeof o.boatId === "string" ? o.boatId : null;
  const experienceId = typeof o.experienceId === "string" ? o.experienceId : null;
  const slotId = typeof o.slotId === "string" ? o.slotId : null;
  const rateId = typeof o.rateId === "string" ? o.rateId : null;
  const partySizeRaw = o.partySize;
  const petsCountRaw = o.petsCount;
  const partySize =
    typeof partySizeRaw === "number" && Number.isInteger(partySizeRaw) && partySizeRaw >= 1 ? partySizeRaw : null;
  let petsCount: number = 0;
  if (petsCountRaw !== undefined && petsCountRaw !== null) {
    if (typeof petsCountRaw === "number" && Number.isInteger(petsCountRaw) && petsCountRaw >= 0) {
      petsCount = petsCountRaw;
    } else {
      petsCount = NaN;
    }
  }
  const marketingOptIn = typeof o.marketingOptIn === "boolean" ? o.marketingOptIn : false;
  const tipCents = typeof o.tipCents === "number" && Number.isInteger(o.tipCents) && o.tipCents >= 0 ? o.tipCents : undefined;
  const discountCode = typeof o.discountCode === "string" ? o.discountCode.trim().toUpperCase() : undefined;
  const missing: string[] = [];
  if (!boatId && !experienceId) missing.push("experienceId or boatId");
  if (!slotId) missing.push("slotId");
  if (!rateId) missing.push("rateId");
  if (partySize == null) missing.push("partySize (positive integer)");
  if (Number.isNaN(petsCount)) missing.push("petsCount (non-negative integer when provided)");
  const customerDraft = o.customerDraft as { name?: string; email?: string; phone?: string } | undefined;
  if (!customerDraft || typeof customerDraft !== "object") {
    missing.push("customerDraft (object with name, email, phone)");
  } else {
    if (typeof customerDraft.name !== "string") missing.push("customerDraft.name");
    if (typeof customerDraft.email !== "string") missing.push("customerDraft.email");
    else {
      const email = (customerDraft.email as string).trim();
      if (email.length > 254) missing.push("customerDraft.email (must be at most 254 characters)");
      else if (!BOOKING_EMAIL_REGEX.test(email)) missing.push("customerDraft.email (must be a valid email format)");
    }
    if (typeof customerDraft.phone !== "string") {
      missing.push("customerDraft.phone");
    } else {
      const phoneResult = validatePhone((customerDraft.phone as string).trim());
      if (!phoneResult.valid) missing.push(`customerDraft.phone (${phoneResult.error})`);
    }
  }
  if (missing.length) {
    return { input: null, hint: `Missing or invalid: ${missing.join(", ")}.` };
  }
  const addonSelectionsRaw = Array.isArray(o.addonSelections) ? (o.addonSelections as { addonId: string; qty: unknown }[]) : [];
  const addonSelections: { addonId: string; qty: number }[] = [];
  for (const s of addonSelectionsRaw) {
    if (typeof s.addonId !== "string" || s.addonId.trim() === "") continue;
    const q = s.qty;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 0) continue;
    addonSelections.push({ addonId: s.addonId.trim(), qty: q });
  }
  const MAX_ANSWER_KEYS = 20;
  const MAX_ANSWER_KEY_LEN = 64;
  const MAX_ANSWER_VALUE_LEN = 1000;
  let answers: Record<string, string> = {};
  if (o.answers != null && o.answers !== undefined) {
    if (typeof o.answers !== "object" || Array.isArray(o.answers)) {
      return { input: null, hint: "answers must be a JSON object with string values." };
    }
    const ansObj = o.answers as Record<string, unknown>;
    const ansKeys = Object.keys(ansObj);
    if (ansKeys.length > MAX_ANSWER_KEYS) {
      return { input: null, hint: `answers may have at most ${MAX_ANSWER_KEYS} keys.` };
    }
    for (const k of ansKeys) {
      if (k.length > MAX_ANSWER_KEY_LEN) {
        return { input: null, hint: `each answers key must be at most ${MAX_ANSWER_KEY_LEN} characters.` };
      }
      const v = ansObj[k];
      if (typeof v !== "string") {
        return { input: null, hint: "answers values must be strings." };
      }
      if (v.length > MAX_ANSWER_VALUE_LEN) {
        return { input: null, hint: `each answers value must be at most ${MAX_ANSWER_VALUE_LEN} characters.` };
      }
      answers[k] = v;
    }
  }
  let bookingMode: "shared" | "charter" | undefined;
  if (Object.prototype.hasOwnProperty.call(o, "bookingMode")) {
    if (o.bookingMode !== "shared" && o.bookingMode !== "charter") {
      return { input: null, hint: 'bookingMode must be "shared" or "charter" when provided.' };
    }
    bookingMode = o.bookingMode === "shared" ? "shared" : "charter";
  }
  const resumeHoldId = typeof o.resumeHoldId === "string" && o.resumeHoldId.trim() ? o.resumeHoldId.trim() : undefined;
  let holdRequestId: string | undefined;
  if (o.holdRequestId != null && o.holdRequestId !== undefined) {
    if (typeof o.holdRequestId !== "string") {
      return { input: null, hint: "holdRequestId must be a string when provided." };
    }
    const trimmed = o.holdRequestId.trim();
    if (trimmed.length > 0) {
      if (trimmed.length < 8 || trimmed.length > 128 || !/^[0-9a-zA-Z_-]+$/.test(trimmed)) {
        return {
          input: null,
          hint: "holdRequestId must be 8–128 characters (letters, digits, underscore, hyphen).",
        };
      }
      holdRequestId = trimmed;
    }
  }
  const release_token =
    typeof o.release_token === "string" && o.release_token.trim() ? o.release_token.trim() : undefined;
  return {
    input: {
      boatId: boatId ?? undefined,
      experienceId: experienceId ?? undefined,
      slotId: slotId!,
      rateId: rateId!,
      addonSelections,
      partySize: partySize!,
      petsCount,
      answers,
      customerDraft: {
        name: (customerDraft!.name as string).trim(),
        email: (customerDraft!.email as string).trim().slice(0, 254),
        phone: (customerDraft!.phone as string).trim(),
      },
      marketingOptIn,
      tipCents,
      discountCode: discountCode || undefined,
      ...(bookingMode ? { bookingMode } : {}),
      resumeHoldId,
      holdRequestId,
      ...(release_token ? { release_token } : {}),
    },
  };
}
