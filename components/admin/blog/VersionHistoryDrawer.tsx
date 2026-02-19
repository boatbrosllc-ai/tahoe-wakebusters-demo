"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { History, X } from "lucide-react";

interface Version {
  id: string;
  savedAt: string | null;
  revision: number;
  title: string;
  slug: string;
}

export function VersionHistoryDrawer({
  postId,
  open,
  onClose,
  onRestore,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
  onRestore: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !postId) return;
    setLoading(true);
    fetch(`/api/admin/blog/${postId}/versions`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setVersions(Array.isArray(data.versions) ? data.versions : []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, postId]);

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    try {
      const res = await fetch(`/api/admin/blog/${postId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Restore failed");
      }
      onRestore();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setRestoring(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-brand-dark/10">
          <h2 className="font-semibold text-brand-dark flex items-center gap-2">
            <History className="h-5 w-5" /> Version history
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-brand-bg" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-brand-muted">Loading…</p>}
          {!loading && versions.length === 0 && <p className="text-sm text-brand-muted">No versions yet.</p>}
          {!loading && versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="rounded-lg border border-brand-dark/10 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-dark truncate">{v.title || "(Untitled)"}</p>
                    <p className="text-xs text-brand-muted">
                      Rev {v.revision} · {v.savedAt ? new Date(v.savedAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(v.id)}
                    disabled={restoring !== null}
                  >
                    {restoring === v.id ? "Restoring…" : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
