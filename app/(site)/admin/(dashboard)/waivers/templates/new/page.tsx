"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  WaiverTemplateForm,
  defaultWaiverTemplateFormValues,
  formValuesToPayload,
} from "@/components/waiver/WaiverTemplateForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewWaiverTemplatePage() {
  const router = useRouter();
  const [value, setValue] = useState(defaultWaiverTemplateFormValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/waiver-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValuesToPayload(value)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      router.push("/admin/waivers/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/waivers/templates" className="text-brand-muted hover:text-brand-dark">
          Templates
        </Link>
        <span className="text-brand-muted">/</span>
        <span className="text-brand-dark font-medium">New waiver</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Create waiver template</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Set up the waiver guests will sign. You can edit it later and manage requests from the Waivers section.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <WaiverTemplateForm
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            isNew
            saving={loading}
            error={error}
            submitLabel="Create template"
            cancelHref="/admin/waivers/templates"
          />
        </div>
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-sm">What guests will see</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-brand-muted space-y-2">
              <p>Guests get a link by email. They’ll go through:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Booking summary</li>
                <li>Their info (name, email{value.requiredFields.phone && ", phone"}
                  {value.requiredFields.dob && ", date of birth"})</li>
                <li>Terms and “I agree”</li>
                {value.clauses.filter((c) => c.requiresInitials).length > 0 && (
                  <li>Initials for {value.clauses.filter((c) => c.requiresInitials).length} clause(s)</li>
                )}
                <li>Signature ({value.signature.mode === "draw" ? "draw" : value.signature.mode === "type" ? "type" : "draw + type"})</li>
              </ol>
              <p className="pt-2 text-xs">
                After you create this template, new bookings can automatically get a waiver request and signing link.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
