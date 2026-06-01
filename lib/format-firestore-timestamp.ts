/**
 * Parse Firestore Timestamp-like values from JSON API responses.
 * Handles: Admin SDK Timestamp (via seconds/nanoseconds JSON), protobuf-style _seconds,
 * numeric ms/sec, ISO strings. Plain objects from `JSON.stringify` never have `.toDate()`.
 */

export function parseFirestoreTimestampMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const t = Date.parse(value.trim());
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    if (typeof o.toDate === "function") {
      try {
        const d = (o as { toDate: () => Date }).toDate();
        return Number.isNaN(d.getTime()) ? null : d.getTime();
      } catch {
        /* fall through */
      }
    }
    const secRaw = o.seconds ?? o._seconds;
    const sec =
      typeof secRaw === "number"
        ? secRaw
        : typeof secRaw === "string"
          ? Number(secRaw)
          : NaN;
    if (Number.isFinite(sec)) {
      const nsRaw = o.nanoseconds ?? o._nanoseconds;
      const ns =
        typeof nsRaw === "number"
          ? nsRaw
          : typeof nsRaw === "string"
            ? Number(nsRaw)
            : 0;
      return sec * 1000 + (Number.isFinite(ns) ? ns / 1e6 : 0);
    }
  }
  return null;
}

/** Date only — for compact list rows (optional). */
export function formatAdminDate(value: unknown, locale = "en-US"): string {
  const ms = parseFirestoreTimestampMs(value);
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Date and time — for signed at, sent at, etc. */
export function formatAdminDateTime(value: unknown, locale = "en-US"): string {
  const ms = parseFirestoreTimestampMs(value);
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
