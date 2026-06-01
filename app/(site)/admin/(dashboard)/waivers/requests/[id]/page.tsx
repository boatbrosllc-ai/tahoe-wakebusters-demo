"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatAdminDateTime } from "@/lib/format-firestore-timestamp";
import { isWalkInWaiverRequest, waiverSigningChannelLabel } from "@/lib/waiver/signing-channel-label";

type RequestDetail = {
  id: string;
  bookingId: string;
  status: string;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerDob?: string;
  signingUrl: string;
  signingChannel?: string;
  qrLinkId?: string;
  templateSnapshot?: { title?: string };
  sent?: { initialSentAt?: unknown; lastSentAt?: unknown; reminder1SentAt?: unknown };
  signed?: {
    signedAt?: unknown;
    ip?: string;
    userAgent?: string;
    pdfStoragePath?: string;
    htmlStoragePath?: string;
    signatureStoragePath?: string | null;
    contentHash?: string;
    signedPayload?: {
      signerAddress?: string | null;
      bookingDate?: string | null;
      termsAcceptedAtIso?: string;
      typedName?: string;
      signatureDataUrl?: string;
      initials?: Record<string, string>;
    };
  };
  bookingSummary?: { experienceName?: string; tripDate?: string; startTime?: string; endTime?: string };
};

export default function WaiverRequestDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [req, setReq] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [regeneratePdfBusy, setRegeneratePdfBusy] = useState(false);
  const [regeneratePdfMessage, setRegeneratePdfMessage] = useState<string | null>(null);

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

  const refreshRequest = () =>
    fetch(`/api/admin/waiver-requests/${id}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return data;
      })
      .then(setReq);

  const copyLink = () => {
    if (req?.signingUrl) navigator.clipboard.writeText(req.signingUrl);
  };

  const handleRegeneratePdf = async () => {
    setRegeneratePdfBusy(true);
    setRegeneratePdfMessage(null);
    try {
      const res = await fetch(`/api/admin/waiver-requests/${id}/regenerate-pdf`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const combined = [data.error, data.hint].filter(Boolean).join(" — ") || "PDF generation failed";
        throw new Error(combined);
      }
      await refreshRequest();
      setRegeneratePdfMessage(
        data.alreadyStored ? "PDF was already stored." : "PDF generated and attached to this request."
      );
    } catch (e) {
      setRegeneratePdfMessage(e instanceof Error ? e.message : "Error");
    }
    setRegeneratePdfBusy(false);
  };

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/waiver-requests/${id}/send`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      await refreshRequest();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setSending(false);
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
        <div className="flex flex-wrap items-center gap-2">
          {req.status === "signed" &&
            req.signed &&
            (req.signed.pdfStoragePath || req.signed.htmlStoragePath) && (
              <a href={`/api/waiver/pdf/${req.id}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  {req.signed.pdfStoragePath ? "View PDF" : "Download waiver (HTML)"}
                </Button>
              </a>
            )}
          {req.status === "signed" &&
            req.signed?.htmlStoragePath &&
            !req.signed.pdfStoragePath && (
              <Button
                variant="secondary"
                onClick={handleRegeneratePdf}
                disabled={regeneratePdfBusy}
              >
                {regeneratePdfBusy ? "Generating PDF…" : "Generate PDF from HTML"}
              </Button>
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

      {regeneratePdfMessage && (
        <p
          className={`text-sm ${regeneratePdfMessage.includes("PDF generated") || regeneratePdfMessage.includes("already stored") ? "text-green-800" : "text-red-600"}`}
          role="status"
        >
          {regeneratePdfMessage}
        </p>
      )}

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

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Waiver</h2>
          <p><strong>Template:</strong> {req.templateSnapshot?.title ?? "—"}</p>
          <p><strong>Signed via:</strong> {waiverSigningChannelLabel(req.signingChannel, req.bookingId)}</p>
          {req.qrLinkId ? (
            <p className="text-xs font-mono text-brand-muted break-all mt-1">QR link ID: {req.qrLinkId}</p>
          ) : null}
        </section>

        {(req.bookingSummary || req.signed?.signedPayload?.bookingDate) && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Booking</h2>
            <p><strong>Experience:</strong> {req.bookingSummary?.experienceName ?? "—"}</p>
            <p><strong>Trip date:</strong> {req.bookingSummary?.tripDate ?? req.signed?.signedPayload?.bookingDate ?? "—"}</p>
            <p><strong>Time:</strong> {[req.bookingSummary?.startTime, req.bookingSummary?.endTime].filter(Boolean).join(" – ") || "—"}</p>
            <p className="text-brand-muted font-mono text-xs">Booking ID: {req.bookingId}</p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Signer</h2>
          <p><strong>Name:</strong> {req.signerName ?? "—"}</p>
          <p><strong>Email:</strong> {req.signerEmail ?? "—"}</p>
          <p><strong>Phone:</strong> {req.signerPhone ?? "—"}</p>
          <p><strong>DOB:</strong> {req.signerDob ?? "—"}</p>
          {req.signed?.signedPayload?.signerAddress?.trim() ? (
            <p><strong>Address:</strong> {req.signed.signedPayload.signerAddress}</p>
          ) : null}
          {req.signed?.signedPayload?.bookingDate?.trim() ? (
            <p><strong>Booking date (form):</strong> {req.signed.signedPayload.bookingDate}</p>
          ) : null}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Emails</h2>
          {isWalkInWaiverRequest(req) ? (
            <p className="text-brand-dark">No invite emails — walk-in / QR signing.</p>
          ) : (
            <>
              <p><strong>Initial sent:</strong> {formatAdminDateTime(req.sent?.initialSentAt)}</p>
              <p><strong>Last sent:</strong> {formatAdminDateTime(req.sent?.lastSentAt ?? req.sent?.initialSentAt)}</p>
              <p><strong>Reminder:</strong> {formatAdminDateTime((req.sent as { reminder1SentAt?: unknown })?.reminder1SentAt)}</p>
            </>
          )}
        </section>

        {req.status === "signed" && req.signed && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Signed</h2>
            <p><strong>Signed at:</strong> {formatAdminDateTime(req.signed.signedAt)}</p>
            {req.signed.signedPayload?.termsAcceptedAtIso ? (
              <p><strong>Terms accepted at:</strong> {formatAdminDateTime(req.signed.signedPayload.termsAcceptedAtIso)}</p>
            ) : null}
            <p><strong>IP:</strong> {req.signed.ip ?? "—"}</p>
            <p className="text-xs text-brand-muted break-all"><strong>User-Agent:</strong> {req.signed.userAgent ?? "—"}</p>
            <p className="text-xs font-mono text-brand-muted">Content hash: {req.signed.contentHash ?? "—"}</p>
          </section>
        )}

        {req.status === "signed" && req.signed?.signedPayload && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted mb-2">Signature</h2>
            <div className="rounded-xl border border-brand-dark/10 bg-white p-4 space-y-3">
              {req.signed?.signatureStoragePath ? (
                <div>
                  <p className="text-xs text-brand-muted mb-1">Drawn signature</p>
                  <img
                    src={`/api/admin/waiver-requests/${req.id}/signature-image`}
                    alt="Guest signature"
                    className="max-h-36 w-auto border border-brand-dark/10 rounded bg-white"
                  />
                </div>
              ) : null}
              {req.signed.signedPayload.typedName ? (
                <p><strong>Printed name:</strong> {req.signed.signedPayload.typedName}</p>
              ) : null}
              {req.signed.signedPayload.initials && Object.keys(req.signed.signedPayload.initials).length > 0 ? (
                <div className="mt-3 pt-3 border-t border-brand-dark/10">
                  <p className="text-xs text-brand-muted mb-2">Clause initials</p>
                  <ul className="space-y-1 text-sm">
                    {Object.entries(req.signed.signedPayload.initials).map(([key, val]) => (
                      <li key={key} className="flex justify-between gap-2">
                        <span className="text-brand-muted truncate">{key}</span>
                        <span className="text-brand-dark font-medium uppercase shrink-0">{val}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {req.status === "signed" && req.signed?.htmlStoragePath && !req.signed?.pdfStoragePath && (
          <p className="text-sm text-brand-muted">
            Official signed copy: use <strong>Download waiver (HTML)</strong> above. PDF export can be added later.
          </p>
        )}
      </div>
    </div>
  );
}
