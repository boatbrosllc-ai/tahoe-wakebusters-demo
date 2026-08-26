/** Match an operator block note (usually a first name) to a marketplace guest. */

export function normalizePersonName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => /^[a-z]{3,}$/.test(t));
}

/**
 * True when a calendar block note is the same guest as the marketplace email.
 * Typical operator notes are first names ("Paula", "Timothy"). Does not match empty
 * notes or operational labels like "Maintenance" / "Sunset cruise".
 */
export function blockNoteMatchesGuest(note: string | null | undefined, guestName: string | null | undefined): boolean {
  const block = normalizePersonName(note ?? "");
  const guest = normalizePersonName(guestName ?? "");
  if (!block || !guest) return false;
  if (block === guest) return true;
  const guestFirst = guest.split(" ")[0] ?? "";
  if (guestFirst.length < 3) return false;
  if (block === guestFirst) return true;
  if (guest.startsWith(`${block} `) || block.startsWith(`${guest} `)) return true;
  const blockNames = nameTokens(block);
  return blockNames.length === 1 && blockNames[0] === guestFirst;
}

const SLOT_PLACEHOLDER_SLACK_MS = 60_000;

function isEmptyBlockNote(note: string | null | undefined): boolean {
  return !normalizePersonName(note ?? "");
}

/**
 * Operator placeholder: unnamed block on the mapped boat covering the same window
 * as the incoming marketplace booking (hold-the-slot before the email lands).
 */
export function blockIsExactSlotPlaceholder(opts: {
  note?: string | null;
  blockStart: Date | null | undefined;
  blockEnd: Date | null | undefined;
  slotStart: Date;
  slotEnd: Date;
  blockBoatId?: string | null;
  targetBoatId?: string | null;
}): boolean {
  if (!isEmptyBlockNote(opts.note)) return false;
  const targetBoat = typeof opts.targetBoatId === "string" ? opts.targetBoatId.trim() : "";
  const blockBoat = typeof opts.blockBoatId === "string" ? opts.blockBoatId.trim() : "";
  if (!targetBoat || !blockBoat || blockBoat !== targetBoat) return false;
  const start = opts.blockStart?.getTime?.();
  const end = opts.blockEnd?.getTime?.();
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  return (
    Math.abs(start - opts.slotStart.getTime()) <= SLOT_PLACEHOLDER_SLACK_MS &&
    Math.abs(end - opts.slotEnd.getTime()) <= SLOT_PLACEHOLDER_SLACK_MS
  );
}

export function marketplaceBlockShouldConvert(opts: {
  note?: string | null;
  guestName?: string | null;
  blockStart: Date | null | undefined;
  blockEnd: Date | null | undefined;
  slotStart: Date;
  slotEnd: Date;
  blockBoatId?: string | null;
  targetBoatId?: string | null;
}): boolean {
  return (
    blockNoteMatchesGuest(opts.note, opts.guestName) ||
    blockIsExactSlotPlaceholder(opts)
  );
}
