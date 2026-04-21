"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Copy, Download, RefreshCw, Printer, ExternalLink } from "lucide-react";

type QrLinkRow = {
  id: string;
  active: boolean;
  label?: string;
  assignedBoat?: string;
  useCase?: string;
  signUrl: string;
  kioskUrl: string;
};

export function WaiverQrPanel({ templateId }: { templateId: string }) {
  const [links, setLinks] = useState<QrLinkRow[]>([]);
  const [templateTitle, setTemplateTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [metaDraft, setMetaDraft] = useState({ label: "", assignedBoat: "", useCase: "" });

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/waiver-templates/${templateId}/qr-links`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load QR links");
        return data as { templateTitle?: string; links: QrLinkRow[] };
      })
      .then((d) => {
        setTemplateTitle(d.templateTitle ?? "");
        setLinks(d.links ?? []);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  const generateOrReuse = async (forceNew: boolean) => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/waiver-templates/${templateId}/qr-links`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceNew,
          ...(metaDraft.label.trim() ? { label: metaDraft.label.trim() } : {}),
          ...(metaDraft.assignedBoat.trim() ? { assignedBoat: metaDraft.assignedBoat.trim() } : {}),
          ...(metaDraft.useCase.trim() ? { useCase: metaDraft.useCase.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setWorking(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const rotateLink = async (qrId: string) => {
    if (!confirm("Create a new link and retire this QR? Printed codes will stop working until you reprint.")) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/admin/waiver-qr-links/${qrId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setWorking(false);
    }
  };

  const saveMeta = async (qrId: string, patch: Partial<Pick<QrLinkRow, "label" | "assignedBoat" | "useCase">>) => {
    setWorking(true);
    try {
      const res = await fetch(`/api/admin/waiver-qr-links/${qrId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-brand-dark/10 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="h-5 w-5 text-brand-primary" aria-hidden />
          QR codes & kiosk links
        </CardTitle>
        <CardDescription className="text-xs">
          Stable links for stickers, dock signs, or a captain&apos;s phone. Guests scan → same waiver flow as email links;
          signed waivers appear in Tracking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && <p className="text-sm text-brand-muted">Loading QR setup…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && links.length === 0 && (
          <div className="space-y-4 rounded-xl border border-dashed border-brand-dark/15 p-4">
            <p className="text-sm text-brand-muted">
              No QR link yet for this template. Generate one — the URL stays the same so you can print once.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="qr-label" className="text-sm font-medium text-brand-dark">
                  Label (internal)
                </label>
                <input
                  id="qr-label"
                  value={metaDraft.label}
                  onChange={(e) => setMetaDraft((m) => ({ ...m, label: e.target.value }))}
                  placeholder='e.g. "Bentley boat sticker"'
                  className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                />
              </div>
              <div>
                <label htmlFor="qr-boat" className="text-sm font-medium text-brand-dark">
                  Assigned boat
                </label>
                <input
                  id="qr-boat"
                  value={metaDraft.assignedBoat}
                  onChange={(e) => setMetaDraft((m) => ({ ...m, assignedBoat: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                />
              </div>
              <div>
                <label htmlFor="qr-use" className="text-sm font-medium text-brand-dark">
                  Use case
                </label>
                <input
                  id="qr-use"
                  value={metaDraft.useCase}
                  onChange={(e) => setMetaDraft((m) => ({ ...m, useCase: e.target.value }))}
                  placeholder="sticker, kiosk, captain phone…"
                  className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                />
              </div>
            </div>
            <Button type="button" onClick={() => generateOrReuse(false)} disabled={working}>
              Generate QR link
            </Button>
          </div>
        )}

        {!loading &&
          links.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-brand-dark/10 bg-brand-dark/[0.02] p-4 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                    {row.active ? "Active" : "Retired"}
                  </p>
                  <p className="font-medium text-brand-dark">{templateTitle}</p>
                  <p className="text-xs text-brand-muted mt-1 font-mono break-all">ID: {row.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={`/admin/waivers/qr-print/${row.id}`} target="_blank" rel="noopener noreferrer">
                      <Printer className="h-4 w-4 mr-1" aria-hidden />
                      Print sheet
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => rotateLink(row.id)}
                    disabled={working || !row.active}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" aria-hidden />
                    Rotate link
                  </Button>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-shrink-0 mx-auto lg:mx-0">
                  <div className="rounded-xl border border-brand-dark/15 bg-white p-3 inline-block">
                    <Image
                      src={`/api/admin/waiver-qr-links/${row.id}/image?format=png`}
                      alt=""
                      width={200}
                      height={200}
                      className="w-[200px] h-[200px]"
                      unoptimized
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3 justify-center lg:justify-start">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href={`/api/admin/waiver-qr-links/${row.id}/image?format=png`} download={`waiver-qr-${row.id}.png`}>
                        <Download className="h-4 w-4 mr-1" aria-hidden />
                        PNG
                      </a>
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href={`/api/admin/waiver-qr-links/${row.id}/image?format=svg`} download={`waiver-qr-${row.id}.svg`}>
                        <Download className="h-4 w-4 mr-1" aria-hidden />
                        SVG
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <span className="text-xs font-medium text-brand-muted">Public sign URL</span>
                    <div className="flex gap-2 mt-1">
                      <input
                        readOnly
                        value={row.signUrl}
                        className="flex-1 rounded-lg border border-brand-dark/20 px-3 py-2 text-xs font-mono text-brand-dark bg-white"
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => copy(row.signUrl)} aria-label="Copy URL">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" asChild aria-label="Open">
                        <a href={row.signUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-brand-muted">Kiosk URL (distraction-free)</span>
                    <div className="flex gap-2 mt-1">
                      <input
                        readOnly
                        value={row.kioskUrl}
                        className="flex-1 rounded-lg border border-brand-dark/20 px-3 py-2 text-xs font-mono text-brand-dark bg-white"
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => copy(row.kioskUrl)} aria-label="Copy kiosk URL">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" asChild aria-label="Open kiosk">
                        <a href={row.kioskUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 pt-2">
                    <div>
                      <label htmlFor={`label-${row.id}`} className="text-sm font-medium text-brand-dark">
                        Label
                      </label>
                      <input
                        id={`label-${row.id}`}
                        defaultValue={row.label ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.label ?? "")) saveMeta(row.id, { label: v });
                        }}
                        className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                      />
                    </div>
                    <div>
                      <label htmlFor={`boat-${row.id}`} className="text-sm font-medium text-brand-dark">
                        Boat
                      </label>
                      <input
                        id={`boat-${row.id}`}
                        defaultValue={row.assignedBoat ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.assignedBoat ?? "")) saveMeta(row.id, { assignedBoat: v });
                        }}
                        className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                      />
                    </div>
                    <div>
                      <label htmlFor={`use-${row.id}`} className="text-sm font-medium text-brand-dark">
                        Use case
                      </label>
                      <input
                        id={`use-${row.id}`}
                        defaultValue={row.useCase ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.useCase ?? "")) saveMeta(row.id, { useCase: v });
                        }}
                        className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

        {!loading && links.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-brand-dark/10">
            <Button type="button" variant="outline" size="sm" onClick={() => generateOrReuse(true)} disabled={working}>
              Create another QR link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
