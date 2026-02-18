"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

type TemplateItem = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  version: number;
};

export default function WaiverTemplatesPage() {
  const [list, setList] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/waiver-templates", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return data.templates ?? [];
      })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Waiver templates</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Create and edit waiver templates. Link to requests from bookings.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/waivers/requests">
            <Button variant="outline">Tracking</Button>
          </Link>
          <Link href="/admin/waivers/templates/new">
            <Button className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> New template
            </Button>
          </Link>
        </div>
      </div>

      {loading && <p className="text-brand-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
          {list.length === 0 ? (
            <div className="p-8 text-center text-brand-muted">
              No templates yet. Create one to start sending waiver requests.
            </div>
          ) : (
            <ul className="divide-y divide-brand-dark/5">
              {list.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/waivers/templates/${t.id}`}
                    className="block p-4 hover:bg-brand-primary/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-brand-dark">{t.title}</p>
                        {t.description && (
                          <p className="text-sm text-brand-muted mt-0.5">{t.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {t.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="text-brand-muted text-sm">v{t.version}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
