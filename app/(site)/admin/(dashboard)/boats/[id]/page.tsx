"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { fetchAdminPatchWithForceRetry } from "@/lib/admin-dashboard-patch-with-force";
import { BoatForm, boatFormDataFromApi } from "../BoatForm";
import { Button } from "@/components/ui/button";

export default function EditBoatPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [initialData, setInitialData] = useState<ReturnType<typeof boatFormDataFromApi> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing id");
      return;
    }
    fetch(`/api/admin/boats/${id}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error ?? (res.status === 401 ? "Unauthorized" : res.status === 404 ? "Boat not found" : "Failed to load");
          const hint = data.hint;
          throw new Error(hint ? `${msg} ${hint}` : msg);
        }
        return data;
      })
      .then((api) => setInitialData(boatFormDataFromApi(api)))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(body: Record<string, unknown>) {
    const res = await fetchAdminPatchWithForceRetry(`/api/admin/boats/${id}`, body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error as string) || res.statusText;
      const hint = data.hint;
      throw new Error(hint ? `${msg} ${hint}` : msg);
    }
    return { id };
  }

  async function handleDelete() {
    if (!confirm("Delete this boat? This cannot be undone. Rates, slots, and add-ons for this boat will also be removed.")) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/boats/${id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error as string) || "Delete failed");
      router.push("/admin/boats");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl flex items-center justify-center py-12">
        <p className="text-brand-muted">Loading…</p>
      </div>
    );
  }
  if (error || !initialData) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <p className="text-red-700">{error ?? "Not found"}</p>
          <Link href="/admin/boats" className="mt-4 inline-block text-brand-primary hover:underline">Back to boats</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Edit boat</h1>
          <p className="mt-1 text-sm text-brand-muted">Update boat details, photos, and which listings it appears in. Pricing is set on each listing.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleDelete}
          disabled={deleting}
          className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 shrink-0"
        >
          <Trash2 className="h-4 w-4 mr-2" aria-hidden />
          {deleting ? "Deleting…" : "Delete boat"}
        </Button>
      </div>
      {deleteError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}
      <BoatForm
        initialData={initialData}
        boatId={id}
        backHref="/admin/boats"
        submitLabel="Save changes"
        onSubmit={onSubmit}
      />
    </div>
  );
}
