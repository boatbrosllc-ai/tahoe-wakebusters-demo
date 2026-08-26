"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DISCOUNT_ASSIGNED_TO_TYPES,
  DISCOUNT_ASSIGNED_TO_TYPE_LABELS,
} from "@/lib/booking/discount-assignment";
import type { DiscountAssignedToType } from "@/lib/booking/types";

type DiscountItem = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  percent?: number;
  valueCents?: number;
  expiresAt: string | null;
  maxRedemptions?: number;
  usedCount: number;
  active: boolean;
  description?: string;
  assignedTo?: string;
  assignedToType?: DiscountAssignedToType;
  createdAt: string | null;
};

export default function AdminDiscountsPage() {
  const [list, setList] = useState<DiscountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createType, setCreateType] = useState<"percent" | "fixed">("percent");
  const [createPercent, setCreatePercent] = useState(10);
  const [createValueCents, setCreateValueCents] = useState(5000);
  const [createExpiresAt, setCreateExpiresAt] = useState("");
  const [createMaxRedemptions, setCreateMaxRedemptions] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createAssignedTo, setCreateAssignedTo] = useState("");
  const [createAssignedToType, setCreateAssignedToType] = useState<DiscountAssignedToType | "">("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editAssignedToType, setEditAssignedToType] = useState<DiscountAssignedToType | "">("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const fetchList = () => {
    setLoading(true);
    fetch("/api/admin/discounts", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return Array.isArray(data) ? data : [];
      })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: createCode.trim(),
          type: createType,
          percent: createType === "percent" ? createPercent : undefined,
          valueCents: createType === "fixed" ? createValueCents : undefined,
          expiresAt: createExpiresAt.trim() || undefined,
          maxRedemptions: createMaxRedemptions.trim() ? parseInt(createMaxRedemptions, 10) : undefined,
          description: createDescription.trim() || undefined,
          assignedTo: createAssignedTo.trim() || undefined,
          assignedToType: createAssignedToType || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setCreateOpen(false);
      setCreateCode("");
      setCreatePercent(10);
      setCreateValueCents(5000);
      setCreateExpiresAt("");
      setCreateMaxRedemptions("");
      setCreateDescription("");
      setCreateAssignedTo("");
      setCreateAssignedToType("");
      fetchList();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreateLoading(false);
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setTogglingId(null);
    }
  };

  const startEdit = (d: DiscountItem) => {
    setEditingId(d.id);
    setEditAssignedTo(d.assignedTo ?? "");
    setEditAssignedToType(d.assignedToType ?? "");
    setEditDescription(d.description ?? "");
  };

  const saveEdit = async (id: string) => {
    setEditLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedTo: editAssignedTo.trim() || null,
          assignedToType: editAssignedToType || null,
          description: editDescription.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setEditingId(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setEditLoading(false);
    }
  };

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatCents(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Discount codes</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Create codes to share with customers. Assign an owner so{" "}
            <Link href="/admin/financials" className="text-brand-primary hover:underline">
              Financials
            </Link>{" "}
            can measure who is driving conversions.
          </p>
        </div>
        <Button onClick={() => setCreateOpen((o) => !o)} className="shrink-0 w-full sm:w-auto">
          {createOpen ? "Cancel" : "Create discount code"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">Sign in</Link>
        </div>
      )}

      {createOpen && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-brand-dark">New discount code</h2>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Code</span>
              <input
                type="text"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                placeholder="e.g. SUMMER20"
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark uppercase"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Type</span>
              <select
                value={createType}
                onChange={(e) => setCreateType(e.target.value as "percent" | "fixed")}
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              >
                <option value="percent">Percent off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </label>
            {createType === "percent" && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-brand-dark">Percent (1–100)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={createPercent}
                  onChange={(e) => setCreatePercent(parseInt(e.target.value, 10) || 0)}
                  className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                />
              </label>
            )}
            {createType === "fixed" && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-brand-dark">Amount off (cents)</span>
                <input
                  type="number"
                  min={1}
                  value={createValueCents}
                  onChange={(e) => setCreateValueCents(parseInt(e.target.value, 10) || 0)}
                  className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                />
                <span className="text-xs text-brand-muted">{formatCents(createValueCents)}</span>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Expires (optional)</span>
              <input
                type="date"
                value={createExpiresAt}
                onChange={(e) => setCreateExpiresAt(e.target.value)}
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Max uses (optional)</span>
              <input
                type="number"
                min={1}
                value={createMaxRedemptions}
                onChange={(e) => setCreateMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Connected to (optional)</span>
              <input
                type="text"
                value={createAssignedTo}
                onChange={(e) => setCreateAssignedTo(e.target.value)}
                placeholder="e.g. Hotel X, Sarah, Spring email"
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Owner type</span>
              <select
                value={createAssignedToType}
                onChange={(e) => setCreateAssignedToType((e.target.value || "") as DiscountAssignedToType | "")}
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              >
                <option value="">Not set</option>
                {DISCOUNT_ASSIGNED_TO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DISCOUNT_ASSIGNED_TO_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-dark">Description (optional, admin only)</span>
            <input
              type="text"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="e.g. Summer promo for email list"
              className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={createLoading || !createCode.trim()}>
              {createLoading ? "Creating…" : "Create"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {editingId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit(editingId);
          }}
          className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-4 sm:p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-brand-dark">
            Edit {list.find((d) => d.id === editingId)?.code ?? "code"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Connected to</span>
              <input
                type="text"
                value={editAssignedTo}
                onChange={(e) => setEditAssignedTo(e.target.value)}
                placeholder="Person, partner, or campaign"
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Owner type</span>
              <select
                value={editAssignedToType}
                onChange={(e) => setEditAssignedToType((e.target.value || "") as DiscountAssignedToType | "")}
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
              >
                <option value="">Not set</option>
                {DISCOUNT_ASSIGNED_TO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DISCOUNT_ASSIGNED_TO_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-brand-dark">Description</span>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={editLoading}>
              {editLoading ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        {loading && <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">Loading…</div>}
        {!loading && list.length === 0 && (
          <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">
            No discount codes yet. Create one to send to customers — they enter it at checkout.
          </div>
        )}
        {!loading && list.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Code</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Connected to</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Type</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Value</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Used</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Expires</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Status</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                      <td className="px-3 py-3 sm:px-4 sm:py-4 font-mono font-semibold text-brand-dark">{d.code}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">
                        {d.assignedTo ? (
                          <span>
                            {d.assignedTo}
                            {d.assignedToType ? (
                              <span className="block text-xs text-brand-muted">
                                {DISCOUNT_ASSIGNED_TO_TYPE_LABELS[d.assignedToType]}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-brand-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark capitalize">{d.type}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">
                        {d.type === "percent" ? `${d.percent ?? 0}%` : formatCents(d.valueCents ?? 0)}
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">
                        {d.usedCount}
                        {d.maxRedemptions != null ? ` / ${d.maxRedemptions}` : ""}
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted">{formatDate(d.expiresAt)}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            d.active ? "bg-emerald-100 text-emerald-800" : "bg-brand-dark/10 text-brand-muted"
                          )}
                        >
                          {d.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEdit(d)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleActive(d.id, d.active)}
                            disabled={togglingId === d.id}
                          >
                            {togglingId === d.id ? "…" : d.active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden space-y-3 p-4">
              {list.map((d) => (
                <div key={d.id} className="rounded-xl border border-brand-dark/10 bg-brand-bg/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-brand-dark text-sm">{d.code}</span>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                        d.active ? "bg-emerald-100 text-emerald-800" : "bg-brand-dark/10 text-brand-muted"
                      )}
                    >
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-brand-muted space-y-0.5">
                    <p className="capitalize">{d.type} · {d.type === "percent" ? `${d.percent ?? 0}% off` : formatCents(d.valueCents ?? 0) + " off"}</p>
                    <p>Used: {d.usedCount}{d.maxRedemptions != null ? ` / ${d.maxRedemptions}` : ""} · Expires: {formatDate(d.expiresAt)}</p>
                    <p>
                      {d.assignedTo
                        ? `${d.assignedTo}${d.assignedToType ? ` · ${DISCOUNT_ASSIGNED_TO_TYPE_LABELS[d.assignedToType]}` : ""}`
                        : "Unassigned"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(d)} className="flex-1 min-h-[40px]">
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(d.id, d.active)}
                      disabled={togglingId === d.id}
                      className="flex-1 min-h-[40px]"
                    >
                      {togglingId === d.id ? "…" : d.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
