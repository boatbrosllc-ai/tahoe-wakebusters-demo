import { isSuperAdminEmail, getSuperAdminDisplayName } from "./roles";

/** Internal ops → captain notes on a booking. Never shown to guests. */

export const MAX_OPERATOR_NOTES_LENGTH = 2000;
export const MAX_OPERATOR_NOTES_LOG = 40;

export type OperatorNoteEntry = {
  id: string;
  text: string;
  by: string;
  byName?: string;
  at: string;
};

export type OperatorNotesPublic = {
  operatorNotes: string | null;
  operatorNotesUpdatedAt: string | null;
  operatorNotesBy: string | null;
  operatorNotesLog: OperatorNoteEntry[];
};

export type OperatorNotesSource = {
  operatorNotes?: string | null;
  operatorNotesUpdatedAt?: unknown;
  operatorNotesBy?: string | null;
  operatorNotesLog?: unknown;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (typeof value !== "object") return null;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  return null;
}

export function sanitizeOperatorNotes(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, MAX_OPERATOR_NOTES_LENGTH);
}

export function newOperatorNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOperatorNoteEntry(raw: unknown): OperatorNoteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { id?: unknown; text?: unknown; by?: unknown; byName?: unknown; at?: unknown };
  const text = sanitizeOperatorNotes(row.text);
  if (!text) return null;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : newOperatorNoteId();
  const by = typeof row.by === "string" ? row.by.trim() : "";
  const byName = typeof row.byName === "string" ? row.byName.trim() : "";
  const at = toIso(row.at) ?? "";
  return { id, text, by, ...(byName ? { byName } : {}), at };
}

function seedLegacyOperatorNote(source: OperatorNotesSource): OperatorNoteEntry | null {
  const text = sanitizeOperatorNotes(source.operatorNotes);
  if (!text) return null;
  return {
    id: "legacy",
    text,
    by: typeof source.operatorNotesBy === "string" ? source.operatorNotesBy.trim() : "",
    at: toIso(source.operatorNotesUpdatedAt) ?? "",
  };
}

/** Oldest first. Seeds a single legacy note when the log has not been written yet. */
export function readOperatorNotesLog(source: OperatorNotesSource | null | undefined): OperatorNoteEntry[] {
  if (!source) return [];
  const raw = Array.isArray(source.operatorNotesLog) ? source.operatorNotesLog : [];
  const parsed = raw.map(normalizeOperatorNoteEntry).filter((row): row is OperatorNoteEntry => row != null);
  if (parsed.length > 0) {
    return parsed
      .slice()
      .sort((a, b) => (a.at || "").localeCompare(b.at || "") || a.id.localeCompare(b.id));
  }
  const legacy = seedLegacyOperatorNote(source);
  return legacy ? [legacy] : [];
}

export function appendOperatorNote(
  existing: OperatorNoteEntry[],
  text: string,
  by: string,
  at: string,
  id = newOperatorNoteId(),
  byName?: string
): OperatorNoteEntry[] {
  const name = (byName ?? "").trim();
  const next: OperatorNoteEntry = {
    id,
    text: sanitizeOperatorNotes(text),
    by: by.trim(),
    ...(name ? { byName: name } : {}),
    at,
  };
  if (!next.text) return existing;
  return [...existing, next].slice(-MAX_OPERATOR_NOTES_LOG);
}

function titleCaseWord(raw: string): string {
  const token = raw.trim();
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function firstNameFromDisplay(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t || t.includes("@")) return "";
  return titleCaseWord(t.split(/\s+/)[0] ?? "");
}

/** First name for captain-facing copy, e.g. Admin — never a raw email. */
export function operatorNoteAuthorFirstName(entry: {
  by?: string | null;
  byName?: string | null;
}): string {
  const fromName = firstNameFromDisplay(entry.byName);
  if (fromName) return fromName;
  const by = (entry.by ?? "").trim();
  if (isSuperAdminEmail(by) || by.toLowerCase() === getSuperAdminDisplayName().toLowerCase()) {
    return getSuperAdminDisplayName();
  }
  const fromBy = firstNameFromDisplay(by);
  if (fromBy) return fromBy;
  if (by.includes("@")) {
    const local = by.split("@")[0]?.replace(/[._+-]+/g, " ").trim() ?? "";
    const guessed = firstNameFromDisplay(local);
    if (guessed) return guessed;
  }
  return "the office";
}

export function fromOperatorNoteAuthorLabel(entry: { by?: string | null; byName?: string | null }): string {
  return `From ${operatorNoteAuthorFirstName(entry)}`;
}

export function pickOperatorNotesApiFields(b: OperatorNotesSource): OperatorNotesPublic {
  const log = readOperatorNotesLog(b);
  const latest = log[log.length - 1] ?? null;
  return {
    operatorNotes: latest?.text ?? null,
    operatorNotesUpdatedAt: latest?.at || toIso(b.operatorNotesUpdatedAt),
    operatorNotesBy: latest?.by || (typeof b.operatorNotesBy === "string" ? b.operatorNotesBy.trim() : "") || null,
    operatorNotesLog: log,
  };
}

export function formatOperatorNoteTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
