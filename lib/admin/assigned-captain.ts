/** Assigned captain on a booking (API + calendar). No pricing. */

export type AssignedCaptainPublic = {
  email: string;
  name: string;
  assignedAt: string | null;
  assignedBy: string | null;
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

export function normalizeCaptainEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Read assignment from a Firestore booking (or API payload). */
export function readAssignedCaptain(b: {
  captainEmail?: string | null;
  assignedCaptain?: {
    email?: string | null;
    name?: string | null;
    assignedAt?: unknown;
    assignedBy?: string | null;
  } | null;
}): AssignedCaptainPublic | null {
  const nested = b.assignedCaptain;
  const email = normalizeCaptainEmail(nested?.email || b.captainEmail);
  if (!email) return null;
  const name =
    typeof nested?.name === "string" && nested.name.trim() ? nested.name.trim() : email;
  return {
    email,
    name,
    assignedAt: toIso(nested?.assignedAt),
    assignedBy: typeof nested?.assignedBy === "string" && nested.assignedBy.trim() ? nested.assignedBy.trim() : null,
  };
}

export function pickAssignedCaptainApiFields(b: {
  captainEmail?: string | null;
  assignedCaptain?: AssignedCaptainPublic | { email?: string; name?: string; assignedAt?: unknown; assignedBy?: string } | null;
}): { captainEmail: string | null; assignedCaptain: AssignedCaptainPublic | null } {
  const assignedCaptain = readAssignedCaptain(b);
  return {
    captainEmail: assignedCaptain?.email ?? null,
    assignedCaptain,
  };
}

export function bookingAssignedToCaptain(
  b: { captainEmail?: string | null; assignedCaptain?: { email?: string | null } | null },
  captainEmail: string
): boolean {
  const assigned = readAssignedCaptain(b);
  return assigned?.email === normalizeCaptainEmail(captainEmail);
}
