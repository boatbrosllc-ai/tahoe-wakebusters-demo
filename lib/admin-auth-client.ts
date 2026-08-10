"use client";

import { ADMIN_AUTH_VERIFICATION_UNAVAILABLE } from "@/lib/admin-auth-constants";

const STORAGE_KEY = "nsf-admin-auth-sync";
const BROADCAST_NAME = "nsf-admin-auth";

export type AdminSessionClientState =
  | { status: "signed_in" }
  | { status: "signed_out" }
  | { status: "unavailable" };

function parseSessionPayload(data: { signedIn?: boolean; verificationUnavailable?: boolean }): AdminSessionClientState {
  if (data.verificationUnavailable) return { status: "unavailable" };
  if (data.signedIn === true) return { status: "signed_in" };
  return { status: "signed_out" };
}

/** GET /api/admin/session — use for header and cross-tab refresh. */
export async function revalidateAdminSession(): Promise<AdminSessionClientState> {
  try {
    const res = await fetch("/api/admin/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      signedIn?: boolean;
      verificationUnavailable?: boolean;
    };
    if (res.status === 503 && data.verificationUnavailable) {
      return { status: "unavailable" };
    }
    if (!res.ok) return { status: "signed_out" };
    return parseSessionPayload(data);
  } catch {
    return { status: "signed_out" };
  }
}

/** Notify other tabs to refetch session (after login/logout in this tab). */
export function notifyAdminAuthChanged(): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // private mode / disabled storage
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(BROADCAST_NAME);
      ch.postMessage({ type: "admin-auth-changed" });
      ch.close();
    }
  } catch {
    // unsupported
  }
}

/**
 * Run `check` on visibility/focus and when other tabs signal auth changes.
 * Returns unsubscribe for useEffect cleanup.
 */
export function subscribeAdminAuthRevalidate(check: () => void): () => void {
  const runIfVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    check();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) check();
  };

  const onFocus = () => runIfVisible();

  let bc: BroadcastChannel | null = null;
  const onMessage = () => check();

  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BROADCAST_NAME);
        bc.addEventListener("message", onMessage);
      }
    } catch {
      bc = null;
    }
  }

  return () => {
    if (typeof window === "undefined") return;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("storage", onStorage);
    bc?.removeEventListener("message", onMessage);
    bc?.close();
  };
}

export type AdminApiErrorKind = "session_expired" | "verification_unavailable" | "other";

export function classifyAdminApiError(res: Response, data: unknown): AdminApiErrorKind {
  if (res.status === 401) return "session_expired";
  const code = data && typeof data === "object" && "code" in data ? String((data as { code?: string }).code) : "";
  if (res.status === 503 && code === ADMIN_AUTH_VERIFICATION_UNAVAILABLE) return "verification_unavailable";
  return "other";
}

/** Same-origin admin API: send user to login when session is rejected (401 only). */
export function redirectToAdminLogin(): void {
  if (typeof window !== "undefined") window.location.href = "/admin/login";
}

/** Thrown when navigating to login so callers can abort without treating it as a load failure. */
export class AdminSessionRedirectError extends Error {
  constructor() {
    super("Admin session redirect");
    this.name = "AdminSessionRedirectError";
  }
}

/** If `res` is not ok, throws; on 401 redirects first and throws `AdminSessionRedirectError`. */
export function throwIfAdminApiError(res: Response, data: unknown, defaultMessage = "Failed to load"): void {
  if (res.ok) return;
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const kind = classifyAdminApiError(res, data);
  if (kind === "session_expired") {
    redirectToAdminLogin();
    throw new AdminSessionRedirectError();
  }
  if (kind === "verification_unavailable") {
    throw new Error(
      typeof obj.hint === "string" ? obj.hint : "Session verification temporarily unavailable. Try again shortly."
    );
  }
  const msg = typeof obj.error === "string" ? obj.error : defaultMessage;
  const hint = typeof obj.hint === "string" ? obj.hint : undefined;
  throw new Error(hint ? `${msg} ${hint}` : msg);
}
