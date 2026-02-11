"use client";

import { BoatForm, getDefaultBoatFormData } from "../BoatForm";

export default function NewBoatPage() {
  async function onSubmit(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/boats", {
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
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Add boat</h1>
        <p className="mt-1 text-sm text-brand-muted">Create a boat (photos and charter durations), then assign it to one or more listings. Pricing is set on each listing.</p>
      </div>
      <BoatForm
        initialData={getDefaultBoatFormData()}
        backHref="/admin/boats"
        submitLabel="Create boat"
        onSubmit={onSubmit}
      />
    </div>
  );
}
