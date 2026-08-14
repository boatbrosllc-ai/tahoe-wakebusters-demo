/** Serialize a JSON-compatible value as TypeScript literal source. */
export function formatTsValue(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${padInner}${formatTsValue(v, indent + 1)}`).join(",\n");
    return `[\n${items},\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.map(
      ([key, val]) => `${padInner}${/^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${formatTsValue(val, indent + 1)}`,
    );
    return `{\n${lines.join(",\n")},\n${pad}}`;
  }
  return "undefined";
}

export function formatTsNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) >= 1000) {
    const s = String(n);
    const withUnderscores = s.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
    return withUnderscores;
  }
  return String(n);
}
