"use client";

const FALLBACK_ENDPOINT = "/api/analytics/collect";
const CLIENT_ID_STORAGE_KEY = "ga_fallback_client_id";

function getOrCreateClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing;
    const next = `${Date.now()}.${Math.floor(Math.random() * 1_000_000_000)}`;
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return `${Date.now()}.${Math.floor(Math.random() * 1_000_000_000)}`;
  }
}

export async function sendGaFallbackEvent(eventName: string, params: Record<string, unknown>): Promise<void> {
  if (typeof window === "undefined") return;
  const clientId = getOrCreateClientId();
  const payload = {
    clientId,
    eventName,
    params: {
      ...params,
      page_location: window.location.href,
      page_title: document.title,
    },
  };
  try {
    await fetch(FALLBACK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Best-effort telemetry fallback. Silence to avoid user-facing errors.
  }
}
