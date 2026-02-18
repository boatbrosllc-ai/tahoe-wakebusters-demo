"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type RequestDetail = {
  id: string;
  bookingId: string;
  status: string;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerDob?: string;
  signingUrl: string;
  sent?: { initialSentAt?: unknown; lastSentAt?: unknown; reminder1SentAt?: unknown };
  signed?: {
    signedAt?: unknown;
    ip?: string;
    userAgent?: string;
    pdfUrl?: string;
    pdfStoragePath?: string;
    contentHash?: string;
  };
  bookingSummary?: { experienceName?: string; tripDate?: string; startTime?: string; endTime?: string };
};

function formatDate(v: unknown): string {
  if (!v) return "—";
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toLocaleString("en-US");
  }
  if (typeof (v as { seconds?: number }).seconds === "number") {
    return new Date((v as { seconds: number }).seconds * 1000).toLocaleString("en-US");
  }
  return "—";
}

export default function WaiverRequestDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [req, setReq] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/waiver-requests/${id}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return data;
      })
      .then(setReq)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/waiver-requests/${id}/send`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      const updated = await fetch(`/api/admin/waiver-requests/${id}`, { credentials: "include" }).then((r) => r.json());
      setReq(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setSending(false);
  };

  const copyLink = () => {
    if (req?.signingUrl) navigator.clipboard.writeText(req.signingUrl);
  };

  if (loading) return <p className="text-brand-muted">Loading…</p>;
  if (error && !req) return <p className="text-red-600">{error}</p>;
  if (!req) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/waivers/requests" className="text-brand-muted hover:text-brand-dark">
          Requests
        </Link>
        <span className="text-brand-muted">/</span>
        <span className="text-brand-dark font-medium">{req.id}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">Waiver request</h1>
        <div className="flex gap-2">
          {req.status === "signed" && req.signed?.pdfStoragePath && (
            <a
              href={`/api/waiver/pdf/${req.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">View PDF</Button>
            </a>
          )}
          {req.status === "pending" && (
            <>
              <Button onClick={copyLink} variant="outline">Copy signing link</Button>
              <Button onClick={handleResend} disabled={sending}>
                {sending ? "Sending…" : "Resend invite"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-6 space-y-6">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Status</h2>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              req.status === "signed"
                ? "bg-green-100 text-green-800"
                : req.status === "pending"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {req.status}
          </span>
        </section>

        {req.bookingSummary && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Booking</h2>
            <p><strong>Experience:</strong> {req.bookingSummary.experienceName ?? "—"}</p>
            <p><strong>Trip date:</strong> {req.bookingSummary.tripDate ?? "—"}</p>
            <p><strong>Time:</strong> {[req.bookingSummary.startTime, req.bookingSummary.endTime].filter(Boolean).join(" – ") || "—"}</p>
            <p className="text-brand-muted font-mono text-xs">Booking ID: {req.bookingId}</p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Signer</h2>
          <p><strong>Name:</strong> {req.signerName ?? "—"}</p>
          <p><strong>Email:</strong> {req.signerEmail ?? "—"}</p>
          <p><strong>Phone:</strong> {req.signerPhone ?? "—"}</p>
          <p><strong>DOB:</strong> {req.signerDob ?? "—"}</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Sent</h2>
          <p>Initial: {formatDate(req.sent?.initialSentAt)}</p>
          <p>Last sent: {formatDate(req.sent?.lastSentAt)}</p>
          <p>Reminder: {formatDate((req.sent as { reminder1SentAt?: unknown })?.reminder1SentAt) || "—"}</p>
        </section>

        {req.status === "signed" && req.signed && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Signed</h2>
            <p>Signed at: {formatDate(req.signed.signedAt)}</p>
            <p>IP: {req.signed.ip ?? "—"}</p>
            <p className="text-xs text-brand-muted break-all">User-Agent: {req.signed.userAgent ?? "—"}</p>
            <p className="text-xs font-mono text-brand-muted">Content hash: {req.signed.contentHash ?? "—"}</p>
          </section>
        )}
      </div>
    </div>
  );
}
