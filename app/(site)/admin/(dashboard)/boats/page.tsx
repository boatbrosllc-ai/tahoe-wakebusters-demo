"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";

type BoatListItem = {
  id: string;
  name: string;
  slug?: string;
  photos?: string[];
  active: boolean;
  experienceIds?: string[];
  isListingBoat?: boolean;
};

function loadBoats(): Promise<BoatListItem[]> {
  return fetch("/api/admin/boats", { credentials: "include" })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? (res.status === 401 ? "Unauthorized" : "Failed to load");
        const hint = data.hint;
        throw new Error(hint ? `${msg} ${hint}` : msg);
      }
      const list = data.boats ?? data;
      return Array.isArray(list) ? list : [];
    });
}

export default function AdminBoatsPage() {
  const [list, setList] = useState<BoatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    loadBoats()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const publishAll = useCallback(() => {
    setPublishLoading(true);
    setPublishMessage(null);
    fetch("/api/admin/boats/publish-listing", { method: "POST", credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to publish");
        return data;
      })
      .then((data) => {
        setPublishMessage(
          data.updated > 0
            ? `${data.updated} boat(s) published to Our Boats page. Refresh the public /boats page to see them.`
            : "All boats are already on the Our Boats page."
        );
        refresh();
      })
      .catch((e) => setPublishMessage(e instanceof Error ? e.message : "Publish failed"))
      .finally(() => setPublishLoading(false));
  }, [refresh]);

  const needsPublish = list.some((b) => !b.slug || b.isListingBoat !== true);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Boats</h1>
          <p className="mt-1 text-sm text-brand-muted">Add boats (photos and availability), then assign them to listings. Pricing is set on each listing. Users pick a boat when booking an experience.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          {needsPublish && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] gap-2"
              onClick={publishAll}
              disabled={publishLoading || list.length === 0}
            >
              <Ship className="h-4 w-4" aria-hidden />
              {publishLoading ? "Publishing…" : "Publish all to Our Boats page"}
            </Button>
          )}
          <Link href="/admin/boats/new">
            <Button className="min-h-[44px] gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" aria-hidden />
              Add boat
            </Button>
          </Link>
        </div>
      </div>
      {publishMessage && (
        <div className={`rounded-xl px-4 py-3 text-sm ${publishMessage.startsWith("All boats") ? "bg-brand-bg text-brand-dark" : "bg-green-50 text-green-800"}`}>
          {publishMessage}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        {loading && <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">Loading…</div>}
        {error && (
          <div className="p-4 sm:p-6 text-red-600 bg-red-50 border-b border-red-200 text-sm">
            {error}
            {(error === "Unauthorized" || error.includes("not configured")) && (
              <>
                {" "}
                <Link href="/admin/login" className="text-brand-primary hover:underline font-medium">Sign in</Link>
              </>
            )}
          </div>
        )}
        {!loading && !error && list.length === 0 && (
          <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">
            No boats yet.{" "}
            <Link href="/admin/boats/new" className="text-brand-primary hover:underline">Add a boat</Link>.
          </div>
        )}
        {!loading && !error && list.length > 0 && (
          <ul className="divide-y divide-brand-dark/10">
            {list.map((item) => {
              const thumb = item.photos?.[0];
              return (
                <li key={item.id} className="flex items-center gap-3 px-4 py-4 sm:px-6 hover:bg-brand-bg/50 min-h-[56px] sm:min-h-0">
                  {thumb ? (
                    <div className="relative h-12 w-16 shrink-0 rounded-lg overflow-hidden bg-brand-dark/5">
                      <Image src={thumb} alt="" fill className="object-cover" sizes="64px" />
                    </div>
                  ) : (
                    <div className="h-12 w-16 shrink-0 rounded-lg bg-brand-dark/10" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-brand-dark">{item.name}</span>
                    {item.slug && <span className="text-brand-muted text-sm ml-2">/{item.slug}</span>}
                    {(!item.slug || item.isListingBoat !== true) && (
                      <span className="ml-2 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Not on Our Boats page</span>
                    )}
                    {!item.active && (
                      <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Inactive</span>
                    )}
                    {item.experienceIds?.length ? (
                      <span className="ml-2 text-xs text-brand-muted">· {item.experienceIds.length} listing(s)</span>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    <Link href={`/admin/boats/${item.id}`}>
                      <Button variant="outline" size="sm" className="min-h-[40px] sm:min-h-0">Edit</Button>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
