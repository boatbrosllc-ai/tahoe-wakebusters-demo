"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchAdminPatchWithForceRetry } from "@/lib/admin-dashboard-patch-with-force";
import { ExperienceForm, experienceFormDataFromApi } from "../ExperienceForm";

export default function EditExperiencePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [initialData, setInitialData] = useState<ReturnType<typeof experienceFormDataFromApi> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing id");
      return;
    }
    fetch(`/api/admin/experiences/${id}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error ?? (res.status === 401 ? "Unauthorized" : res.status === 404 ? "Experience not found" : "Failed to load");
          const hint = data.hint;
          throw new Error(hint ? `${msg} ${hint}` : msg);
        }
        return data;
      })
      .then((api) => setInitialData(experienceFormDataFromApi(api)))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(body: Record<string, unknown>) {
    const res = await fetchAdminPatchWithForceRetry(`/api/admin/experiences/${id}`, body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error as string) || res.statusText;
      const hint = data.hint;
      throw new Error(hint ? `${msg} ${hint}` : msg);
    }
    return { id };
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
          <a href="/admin/experiences" className="mt-4 inline-block text-brand-primary hover:underline">Back to list</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Edit listing</h1>
        <p className="mt-1 text-sm text-brand-muted">Update listing and rates/add-ons. Only changed fields are sent; rates and add-ons are replaced only when you edit them.</p>
      </div>
      <ExperienceForm
        initialData={initialData}
        experienceId={id}
        backHref="/admin/experiences"
        submitLabel="Save changes"
        onSubmit={onSubmit}
      />
    </div>
  );
}
