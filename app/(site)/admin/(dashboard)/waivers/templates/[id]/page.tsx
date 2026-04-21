"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  WaiverTemplateForm,
  templateToFormValues,
  formValuesToPayload,
  type WaiverTemplateFormValues,
} from "@/components/waiver/WaiverTemplateForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WaiverQrPanel } from "@/components/waiver/WaiverQrPanel";

type Template = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  termsHtml: string;
  requiredFields: { dob: boolean; phone: boolean; address: boolean; bookingDate: boolean };
  clauses: { id: string; label: string; requiresInitials: boolean }[];
  signature: { mode: string; requireTypedName: boolean };
  version: number;
};

export default function EditWaiverTemplatePage() {
  const params = useParams();
  const id = params.id as string;
  const [template, setTemplate] = useState<Template | null>(null);
  const [value, setValue] = useState<WaiverTemplateFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/waiver-templates/${id}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return data;
      })
      .then((t) => {
        setTemplate(t);
        setValue(templateToFormValues(t));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/waiver-templates/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValuesToPayload(value)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setTemplate((prev) =>
        prev ? { ...prev, ...data, version: data.version ?? prev.version + 1 } : null
      );
      setValue(templateToFormValues(data));
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setSaving(false);
    }
  };

  if (loading) return <p className="text-brand-muted">Loading…</p>;
  if (error && !template) return <p className="text-red-600">{error}</p>;
  if (!template || !value) return null;

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm mb-2">
            <Link href="/admin/waivers/templates" className="text-brand-muted hover:text-brand-dark transition-colors">
              Templates
            </Link>
            <span className="text-brand-muted">/</span>
            <span className="text-brand-dark font-medium">{template.title}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary text-xs font-medium">
              v{template.version}
            </span>
          </nav>
          <h1 className="text-2xl font-bold text-brand-dark tracking-tight">Edit waiver template</h1>
          <p className="mt-1 text-sm text-brand-muted max-w-xl">
            Changes create a new version. Existing signed waivers keep the version they used.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 xl:gap-10">
        <div className="xl:col-span-3 min-w-0">
          <WaiverTemplateForm
            value={value}
            onChange={setValue}
            onSubmit={handleSave}
            isNew={false}
            saving={saving}
            error={error}
            submitLabel="Save (new version)"
            cancelHref="/admin/waivers/templates"
          />
        </div>
        <div className="xl:col-span-2">
          <div className="sticky top-6 space-y-4">
            <Card className="rounded-2xl border border-brand-dark/10 shadow-sm overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-brand-dark">Live preview</CardTitle>
                <CardDescription className="text-xs">
                  How the terms and flow look to guests.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="mx-auto rounded-2xl border border-brand-dark/15 bg-white shadow-md overflow-hidden max-w-[300px] ring-1 ring-black/5">
                  <div className="bg-brand-dark/5 px-4 py-2.5 border-b border-brand-dark/10">
                    <span className="text-xs font-medium text-brand-muted">Guest view</span>
                  </div>
                  <div className="p-4 min-h-[320px] max-h-[440px] overflow-y-auto text-[13px]">
                    <p className="font-semibold text-brand-dark mb-3">{value.title}</p>
                    <div
                      className="prose prose-sm max-w-none text-brand-dark/90 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5"
                      dangerouslySetInnerHTML={{
                        __html: value.termsHtml || "<p class='text-brand-muted italic'>No terms yet.</p>",
                      }}
                    />
                    {value.clauses.filter((c) => c.label.trim()).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-brand-dark/10">
                        <p className="text-xs font-medium text-brand-muted mb-1.5">Acknowledgements</p>
                        <ul className="text-brand-dark space-y-1">
                          {value.clauses
                            .filter((c) => c.label.trim())
                            .map((c) => (
                              <li key={c.id} className="text-xs">
                                {c.label}
                                {c.requiresInitials && (
                                  <span className="text-brand-muted ml-1">(initials)</span>
                                )}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <WaiverQrPanel templateId={id} />
    </div>
  );
}
