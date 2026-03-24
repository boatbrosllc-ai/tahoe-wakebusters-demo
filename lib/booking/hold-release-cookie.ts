import type { NextRequest, NextResponse } from "next/server";

/** HttpOnly cookie so release-hold works when JS loses the in-memory `releaseToken` (same value as JSON). */
export const HOLD_RELEASE_COOKIE_NAME = "bb_hold_release";

export function attachHoldReleaseCookie(
  res: NextResponse,
  releaseToken: string | undefined,
  expiresAtIso: string
): void {
  if (!releaseToken?.trim()) return;
  const expMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expMs)) return;
  const maxAge = Math.max(60, Math.floor((expMs - Date.now()) / 1000));
  res.cookies.set(HOLD_RELEASE_COOKIE_NAME, encodeURIComponent(releaseToken.trim()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export function getHoldReleaseTokenFromCookie(request: NextRequest): string | null {
  const raw = request.cookies.get(HOLD_RELEASE_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.trim() || null;
  } catch {
    return null;
  }
}

export function clearHoldReleaseCookie(res: NextResponse): void {
  res.cookies.set(HOLD_RELEASE_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
