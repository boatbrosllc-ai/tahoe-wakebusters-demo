"use client";

import { useCallback, useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";

type TeamMemberRow = {
  email: string;
  name: string;
  role: "operator" | "captain";
  status: "active" | "disabled";
  invitedBy: string;
  invitedAt: string | null;
};

type SuperAdminRow = {
  email: string;
  name: string;
  role: "super_admin";
  status: "active";
  locked: true;
};

export default function AdminTeamPage() {
  const [superAdmin, setSuperAdmin] = useState<SuperAdminRow | null>(null);
  const [operators, setOperators] = useState<TeamMemberRow[]>([]);
  const [captains, setCaptains] = useState<TeamMemberRow[]>([]);
  const [inviteRole, setInviteRole] = useState<"operator" | "captain">("operator");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/team", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      setSuperAdmin(json.superAdmin ?? null);
      setOperators(Array.isArray(json.operators) ? json.operators : []);
      setCaptains(Array.isArray(json.captains) ? json.captains : []);
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setNotice(null);
    setResetLink(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role: inviteRole }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      setEmail("");
      setName("");
      setResetLink(typeof json.resetLink === "string" ? json.resetLink : null);
      const roleLabel = inviteRole === "captain" ? "Captain" : "Operator";
      if (json.emailSent) {
        setNotice(`${roleLabel} invited. An email was sent to them with a password-setup link.`);
      } else if (json.resetLink) {
        setNotice(`${roleLabel} invited, but the email did not send. Copy the password-setup link and send it to them.`);
      } else {
        setNotice(`${roleLabel} invited. Ask them to use Forgot password on the admin login page.`);
      }
      await load();
    } catch (err) {
      if (err instanceof AdminSessionRedirectError) return;
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function setStatus(memberEmail: string, status: "active" | "disabled") {
    setRowBusy(memberEmail);
    setError(null);
    try {
      const res = await fetch(`/api/admin/team/${encodeURIComponent(memberEmail)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      await load();
    } catch (err) {
      if (err instanceof AdminSessionRedirectError) return;
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setRowBusy(null);
    }
  }

  async function removeMember(member: TeamMemberRow) {
    const roleLabel = member.role === "captain" ? "captain" : "operator";
    const ok = window.confirm(
      `Delete ${member.name} (${member.email})? They will be removed from the team and will not be able to sign in.`
    );
    if (!ok) return;
    setRowBusy(member.email);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/team/${encodeURIComponent(member.email)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      setNotice(`${member.name} was removed as ${roleLabel}.`);
      await load();
    } catch (err) {
      if (err instanceof AdminSessionRedirectError) return;
      setError(err instanceof Error ? err.message : "Could not delete team member");
    } finally {
      setRowBusy(null);
    }
  }

  async function copyResetLink(memberEmail: string) {
    setRowBusy(memberEmail);
    setError(null);
    try {
      const res = await fetch(`/api/admin/team/${encodeURIComponent(memberEmail)}?action=reset-link`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json);
      if (typeof json.resetLink === "string" && json.resetLink) {
        try {
          await navigator.clipboard.writeText(json.resetLink);
        } catch {
          /* clipboard can fail */
        }
        setResetLink(json.resetLink);
        setNotice(
          json.emailSent
            ? "Login email sent. The setup link was also copied if your browser allowed it."
            : "Could not send email. The password-setup link is below — send it to them."
        );
      } else {
        setNotice("Could not create a reset link. Ask them to use Forgot password on the login page.");
      }
    } catch (err) {
      if (err instanceof AdminSessionRedirectError) return;
      setError(err instanceof Error ? err.message : "Could not create reset link");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-brand-dark">
          <UserCog className="h-6 w-6 text-brand-primary" aria-hidden />
          Team
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-brand-muted">
          Super Admin is Admin and cannot be changed. Operators can run calendar, bookings, customers, and waivers —
          not financials, discounts, or this page. Captains only see the calendar for trips assigned to them.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>
      )}
      {resetLink && (
        <div className="rounded-2xl border border-brand-dark/10 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Password setup link</p>
          <p className="mt-2 break-all text-xs text-brand-dark">{resetLink}</p>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="border-b border-brand-dark/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-brand-dark">Invite someone</h2>
          <p className="mt-1 text-xs text-brand-muted">They get an email with a password link, then sign in at /admin/login.</p>
        </div>
        <form onSubmit={(e) => void invite(e)} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-brand-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2 text-sm"
              placeholder="Alex"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-brand-muted">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2 text-sm"
              placeholder="va@example.com"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-brand-muted">Role</span>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value === "captain" ? "captain" : "operator")}
              className="w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2 text-sm"
            >
              <option value="operator">Operator</option>
              <option value="captain">Captain</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={inviteBusy}
              className="min-h-[40px] w-full rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              {inviteBusy ? "Inviting…" : "Invite"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="border-b border-brand-dark/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-brand-dark">People</h2>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-brand-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-brand-dark/5">
            {superAdmin && (
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-brand-dark">{superAdmin.name}</p>
                  <p className="text-xs text-brand-muted">{superAdmin.email}</p>
                </div>
                <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-primary">
                  Super Admin
                </span>
              </li>
            )}
            {[...operators, ...captains].map((op) => (
              <li key={op.email} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-brand-dark">{op.name}</p>
                  <p className="text-xs text-brand-muted">{op.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      op.status === "active"
                        ? op.role === "captain"
                          ? "bg-sky-50 text-sky-800"
                          : "bg-emerald-50 text-emerald-800"
                        : "bg-brand-dark/5 text-brand-muted"
                    }`}
                  >
                    {op.status === "active" ? (op.role === "captain" ? "Captain" : "Operator") : "Disabled"}
                  </span>
                  <button
                    type="button"
                    disabled={rowBusy === op.email}
                    onClick={() => void copyResetLink(op.email)}
                    className="rounded-full border border-brand-dark/15 px-3 py-1.5 text-xs font-semibold text-brand-dark hover:bg-brand-bg disabled:opacity-50"
                  >
                    Resend login email
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === op.email}
                    onClick={() => void setStatus(op.email, op.status === "active" ? "disabled" : "active")}
                    className="rounded-full border border-brand-dark/15 px-3 py-1.5 text-xs font-semibold text-brand-dark hover:bg-brand-bg disabled:opacity-50"
                  >
                    {op.status === "active" ? "Disable" : "Re-enable"}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === op.email}
                    onClick={() => void removeMember(op)}
                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {!loading && operators.length === 0 && captains.length === 0 && (
              <li className="px-5 py-6 text-sm text-brand-muted">No operators or captains yet. Invite someone above.</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
