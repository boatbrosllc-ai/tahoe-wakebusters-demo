import "server-only";
import { getDb, getFirestoreExports, getFirebaseApp } from "@/lib/booking/firebase-admin";
import { bookingEnv } from "@/lib/booking/env";
import { randomBytes } from "crypto";
import { isSuperAdminEmail, isTeamInviteRole, normalizeAdminEmail, type AdminRole } from "@/lib/admin/roles";

export const ADMIN_TEAM_COLLECTION = "adminTeam";

export type TeamInviteRole = Extract<AdminRole, "operator" | "captain">;

export type AdminTeamMemberRecord = {
  email: string;
  name: string;
  role: TeamInviteRole;
  status: "active" | "disabled";
  invitedBy: string;
  invitedAt: string | null;
  updatedAt: string | null;
};

function teamDocId(email: string): string {
  return normalizeAdminEmail(email);
}

function toIso(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  return null;
}

export async function getTeamMember(email: string): Promise<AdminTeamMemberRecord | null> {
  const normalized = normalizeAdminEmail(email);
  if (!normalized || isSuperAdminEmail(normalized)) return null;
  const snap = await getDb().collection(ADMIN_TEAM_COLLECTION).doc(teamDocId(normalized)).get();
  if (!snap.exists) return null;
  const data = snap.data() as {
    email?: string;
    name?: string;
    role?: string;
    status?: string;
    invitedBy?: string;
    invitedAt?: unknown;
    updatedAt?: unknown;
  };
  if (!isTeamInviteRole(data.role)) return null;
  if (data.status !== "active" && data.status !== "disabled") return null;
  return {
    email: normalizeAdminEmail(data.email) || normalized,
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : normalized,
    role: data.role,
    status: data.status,
    invitedBy: typeof data.invitedBy === "string" ? data.invitedBy : "",
    invitedAt: toIso(data.invitedAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function getActiveTeamMember(email: string): Promise<AdminTeamMemberRecord | null> {
  const member = await getTeamMember(email);
  if (!member || member.status !== "active") return null;
  return member;
}

export async function listTeamMembers(): Promise<AdminTeamMemberRecord[]> {
  const snap = await getDb().collection(ADMIN_TEAM_COLLECTION).get();
  const out: AdminTeamMemberRecord[] = [];
  for (const doc of snap.docs) {
    const member = await getTeamMember(doc.id);
    if (member) out.push(member);
  }
  out.sort((a, b) => a.email.localeCompare(b.email));
  return out;
}

export async function listActiveCaptains(): Promise<AdminTeamMemberRecord[]> {
  const members = await listTeamMembers();
  return members.filter((m) => m.role === "captain" && m.status === "active");
}

export async function upsertTeamInvite(opts: {
  email: string;
  name: string;
  role: TeamInviteRole;
  invitedBy: string;
}): Promise<AdminTeamMemberRecord> {
  const email = normalizeAdminEmail(opts.email);
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Enter a valid email address."), { code: "INVALID_EMAIL" });
  }
  if (isSuperAdminEmail(email)) {
    throw Object.assign(new Error("The Super Admin account cannot be invited or changed."), {

      code: "SUPER_ADMIN_LOCKED",
    });
  }
  if (!isTeamInviteRole(opts.role)) {
    throw Object.assign(new Error("Role must be operator or captain."), { code: "INVALID_ROLE" });
  }
  const fallbackName = opts.role === "captain" ? "Captain" : "Operator";
  const name = opts.name.trim() || email.split("@")[0] || fallbackName;
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const ref = db.collection(ADMIN_TEAM_COLLECTION).doc(teamDocId(email));
  const existing = await ref.get();
  const now = Timestamp.now();
  const record = {
    email,
    name,
    role: opts.role,
    status: "active" as const,
    invitedBy: normalizeAdminEmail(opts.invitedBy),
    updatedAt: now,
    ...(existing.exists ? {} : { invitedAt: now }),
  };
  await ref.set(record, { merge: true });
  return {
    email,
    name,
    role: opts.role,
    status: "active",
    invitedBy: record.invitedBy,
    invitedAt: existing.exists ? toIso(existing.data()?.invitedAt) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated Use upsertTeamInvite. Kept so existing call sites keep working. */
export async function upsertOperatorInvite(opts: {
  email: string;
  name: string;
  invitedBy: string;
}): Promise<AdminTeamMemberRecord> {
  return upsertTeamInvite({ ...opts, role: "operator" });
}

export async function setTeamMemberStatus(email: string, status: "active" | "disabled"): Promise<AdminTeamMemberRecord> {
  const normalized = normalizeAdminEmail(email);
  if (isSuperAdminEmail(normalized)) {
    throw Object.assign(new Error("The Super Admin account cannot be disabled."), { code: "SUPER_ADMIN_LOCKED" });
  }
  const member = await getTeamMember(normalized);
  if (!member) {
    throw Object.assign(new Error("Team member not found."), { code: "NOT_FOUND" });
  }
  const { Timestamp } = getFirestoreExports();
  await getDb().collection(ADMIN_TEAM_COLLECTION).doc(teamDocId(normalized)).set(
    { status, updatedAt: Timestamp.now() },
    { merge: true }
  );
  try {
    const auth = getFirebaseApp().auth();
    const user = await auth.getUserByEmail(normalized);
    await auth.updateUser(user.uid, { disabled: status === "disabled" });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code !== "auth/user-not-found") throw err;
  }
  return { ...member, status, updatedAt: new Date().toISOString() };
}

export async function deleteTeamMember(email: string): Promise<AdminTeamMemberRecord> {
  const normalized = normalizeAdminEmail(email);
  if (isSuperAdminEmail(normalized)) {
    throw Object.assign(new Error("The Super Admin account cannot be deleted."), { code: "SUPER_ADMIN_LOCKED" });
  }
  const member = await getTeamMember(normalized);
  if (!member) {
    throw Object.assign(new Error("Team member not found."), { code: "NOT_FOUND" });
  }
  await getDb().collection(ADMIN_TEAM_COLLECTION).doc(teamDocId(normalized)).delete();
  try {
    const auth = getFirebaseApp().auth();
    const user = await auth.getUserByEmail(normalized);
    await auth.deleteUser(user.uid);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code !== "auth/user-not-found") throw err;
  }
  return member;
}

export async function ensureFirebaseUserAndResetLink(email: string): Promise<{ resetLink: string | null; createdUser: boolean }> {
  const normalized = normalizeAdminEmail(email);
  const auth = getFirebaseApp().auth();
  let createdUser = false;
  try {
    await auth.getUserByEmail(normalized);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code !== "auth/user-not-found") throw err;
    await auth.createUser({
      email: normalized,
      password: randomBytes(24).toString("base64url"),
      emailVerified: false,
      disabled: false,
    });
    createdUser = true;
  }
  let continueUrl: string | undefined;
  try {
    continueUrl = `${bookingEnv.appBaseUrl.replace(/\/$/, "")}/admin/login`;
  } catch {
    continueUrl = undefined;
  }
  try {
    const resetLink = continueUrl
      ? await auth.generatePasswordResetLink(normalized, { url: continueUrl, handleCodeInApp: false })
      : await auth.generatePasswordResetLink(normalized);
    return { resetLink, createdUser };
  } catch (err) {
    console.warn("[admin team] password reset link with continue URL failed, retrying default", err);
    try {
      const resetLink = await auth.generatePasswordResetLink(normalized);
      return { resetLink, createdUser };
    } catch (err2) {
      console.warn("[admin team] password reset link failed", err2);
      return { resetLink: null, createdUser };
    }
  }
}
