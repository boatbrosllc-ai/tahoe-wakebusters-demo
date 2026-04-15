/**
 * Sanitize values for CSS `object-position` (hero + card crops). Rejects injection-prone characters.
 */
const SAFE_OBJECT_POSITION = /^[a-zA-Z0-9 %.,\-]{1,80}$/;

export function sanitizeCssObjectPosition(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const t = input.trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  if (!SAFE_OBJECT_POSITION.test(t)) return undefined;
  return t;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

/** Map common `object-position` strings to horizontal/vertical % (0–100) for the visual framing tool. */
export function parseObjectPositionToPercents(raw: string): { x: number; y: number } {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return { x: 50, y: 50 };

  const twoPct = /^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(t);
  if (twoPct) {
    return { x: clampPercent(Number(twoPct[1])), y: clampPercent(Number(twoPct[2])) };
  }

  const centerY = /^center\s+(\d+(?:\.\d+)?)%$/i.exec(t);
  if (centerY) return { x: 50, y: clampPercent(Number(centerY[1])) };

  const xCenter = /^(\d+(?:\.\d+)?)%\s+center$/i.exec(t);
  if (xCenter) return { x: clampPercent(Number(xCenter[1])), y: 50 };

  const slugMap: Record<string, { x: number; y: number }> = {
    center: { x: 50, y: 50 },
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 0, y: 50 },
    right: { x: 100, y: 50 },
    "top center": { x: 50, y: 0 },
    "center top": { x: 50, y: 0 },
    "bottom center": { x: 50, y: 100 },
    "center bottom": { x: 50, y: 100 },
    "left center": { x: 0, y: 50 },
    "center left": { x: 0, y: 50 },
    "right center": { x: 100, y: 50 },
    "center right": { x: 100, y: 50 },
    "top left": { x: 0, y: 0 },
    "left top": { x: 0, y: 0 },
    "top right": { x: 100, y: 0 },
    "right top": { x: 100, y: 0 },
    "bottom left": { x: 0, y: 100 },
    "left bottom": { x: 0, y: 100 },
    "bottom right": { x: 100, y: 100 },
    "right bottom": { x: 100, y: 100 },
  };
  const lower = t.toLowerCase();
  if (slugMap[lower]) return slugMap[lower];

  return { x: 50, y: 50 };
}

export function formatPercentsToObjectPosition(x: number, y: number): string {
  return `${Math.round(clampPercent(x))}% ${Math.round(clampPercent(y))}%`;
}
