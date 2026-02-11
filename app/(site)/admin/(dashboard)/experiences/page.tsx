"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExperienceListItem = { id: string; slug: string; title: string; active: boolean; heroUrl?: string };

export default function AdminExperiencesPage() {
  const [list, setList] = useState<ExperienceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/experiences", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error ?? (res.status === 401 ? "Unauthorized" : res.status === 503 ? "Admin not configured" : "Failed to load");
          const hint = data.hint;
          throw new Error(hint ? `${msg} ${hint}` : msg);
        }
        return data;
      })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Listings</h1>
          <p className="mt-1 text-sm text-brand-muted">Create and edit experiences. Calendar and booking read from Firestore.</p>
        </div>
        <Link href="/admin/experiences/new" className="shrink-0">
          <Button className="min-h-[44px] gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Create listing
          </Button>
        </Link>
      </div>

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        {loading && <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">Loading…</div>}
        {error && (
          <div className="p-4 sm:p-6 text-red-600 bg-red-50 border-b border-red-200 text-sm">
              {error}
              {(error === "Unauthorized" || error === "Admin not configured (set ADMIN_EMAIL)" || error === "Admin not configured") && (
                <>
                  {" "}
                  <Link href="/admin/login" className="text-brand-primary hover:underline font-medium">Sign in</Link>
                  {error.includes("not configured") && (
                    <span className="block mt-2 text-sm">Set ADMIN_EMAIL and NEXT_PUBLIC_FIREBASE_* in .env.local and restart the dev server.</span>
                  )}
                </>
              )}
            </div>
          )}
        {!loading && !error && list.length === 0 && (
          <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">
            No experiences yet.{" "}
            <Link href="/admin/experiences/new" className="text-brand-primary hover:underline">Create one</Link>.
          </div>
        )}
        {!loading && !error && list.length > 0 && (
          <ul className="divide-y divide-brand-dark/10">
            {list.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-4 sm:px-6 hover:bg-brand-bg/50 min-h-[56px] sm:min-h-0">
                {item.heroUrl ? (
                  <div className="relative h-12 w-16 shrink-0 rounded-lg overflow-hidden bg-brand-dark/5">
                    <Image src={item.heroUrl} alt="" fill className="object-cover" sizes="64px" />
                  </div>
                ) : (
                  <div className="h-12 w-16 shrink-0 rounded-lg bg-brand-dark/10" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-brand-dark">{item.title}</span>
                  <span className="text-brand-muted text-sm ml-2">/{item.slug}</span>
                  {!item.active && (
                    <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={`/experiences/${item.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-primary hover:underline">View</a>
                  <Link href={`/admin/experiences/${item.id}`}>
                    <Button variant="outline" size="sm" className="min-h-[40px] sm:min-h-0">Edit</Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
