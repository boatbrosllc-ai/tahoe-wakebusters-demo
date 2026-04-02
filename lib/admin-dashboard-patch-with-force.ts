/**
 * Shared PATCH helper for admin edit pages: on 409 with forceRequired, prompt using structured
 * fields from the API, then retry with force: true merged into the original payload.
 */

export type AdminPatchForceConflict = {
  forceRequired?: boolean;
  activeHoldCount?: number;
  holdIds?: string[];
  error?: string;
};

function buildForceConfirmMessage(data: AdminPatchForceConflict): string {
  const err = typeof data.error === "string" ? data.error : "This change requires confirmation.";
  const n = typeof data.activeHoldCount === "number" ? data.activeHoldCount : null;
  const ids = Array.isArray(data.holdIds) ? data.holdIds.filter((x): x is string => typeof x === "string") : [];
  const parts = [err];
  if (n != null) parts.push(`Active holds: ${n}.`);
  else if (ids.length > 0) parts.push(`Hold IDs: ${ids.length} (showing first ${Math.min(8, ids.length)}): ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? "…" : ""}.`);
  parts.push("Proceed and release these holds?");
  return parts.join("\n\n");
}

/**
 * PATCH JSON resource; on forceRequired conflict, confirm then retry with { ...body, force: true }.
 * Non-force 409 responses throw with the server error message (existing error path).
 */
export async function fetchAdminPatchWithForceRetry(
  url: string,
  body: Record<string, unknown>
): Promise<Response> {
  const attempt = async (payload: Record<string, unknown>) =>
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

  let res = await attempt(body);
  if (res.status === 409) {
    const data = (await res.clone().json().catch(() => ({}))) as AdminPatchForceConflict;
    if (data.forceRequired === true) {
      if (!window.confirm(buildForceConfirmMessage(data))) {
        const msg = typeof data.error === "string" ? data.error : "Cancelled.";
        throw new Error(msg);
      }
      res = await attempt({ ...body, force: true });
    }
  }

  return res;
}
