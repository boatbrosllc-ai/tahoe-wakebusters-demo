"use client";

import { ExperienceForm, getDefaultExperienceFormData } from "../ExperienceForm";

export default function NewExperiencePage() {
  async function onSubmit(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error as string) || res.statusText;
      const hint = data.hint;
      throw new Error(hint ? `${msg} ${hint}` : msg);
    }
    return data as { id: string };
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Create listing</h1>
        <p className="mt-1 text-sm text-brand-muted">Add a new experience. Hero and gallery are URL fields (paste links or use /photos/... paths).</p>
      </div>
      <ExperienceForm
          initialData={getDefaultExperienceFormData()}
          backHref="/admin/experiences"
          submitLabel="Create experience"
          onSubmit={onSubmit}
      />
    </div>
  );
}
