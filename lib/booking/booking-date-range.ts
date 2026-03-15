/**
 * Shared booking date-range helpers. Used by BookingPageClient and CalendarModal
 * so both use consistent month boundaries and can browse/fetch any month.
 */

/** Returns today's date string (YYYY-MM-DD) in America/Chicago timezone. */
export function getChicagoToday(): string {
  try {
    const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
    // en-CA can be "YYYY-MM-DD" or "DD/MM/YYYY" depending on env; normalize to YYYY-MM-DD
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

/** YYYY-MM-DD from a Date's calendar parts (for month boundaries). */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Month key YYYY-MM (e.g. 2026-03). Deterministic, no Date keys. */
export function toMonthKey(year: number, month1Based: number): string {
  return `${year}-${String(month1Based).padStart(2, "0")}`;
}

/** Date range for a single calendar month. month is 0-indexed (0 = January). Builds from string only for start; end uses last day. */
export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const start = `${monthKey}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Range covering one month before through one month after (for visible + adjacent prefetch). */
export function getMonthRangeWithAdjacent(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month + 2, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

/**
 * Day options for a calendar month grid.
 * @param month - 0-indexed: January = 0, December = 11
 */
export function getDaysInMonth(
  year: number,
  month: number
): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const last = new Date(year, month + 1, 0);
  const count = last.getDate();
  for (let day = 1; day <= count; day++) {
    const d = new Date(year, month, day);
    out.push({
      dateStr: toDateStr(d),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return out;
}
