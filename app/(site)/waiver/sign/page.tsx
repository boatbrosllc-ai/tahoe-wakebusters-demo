"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WaiverSigningWizard } from "@/components/waiver/WaiverSigningWizard";
import type { WaiverValidateResponse } from "@/lib/waiver/types";

export default function WaiverSignPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const group = searchParams.get("group")?.trim() ?? "";
  const qr = searchParams.get("qr")?.trim() ?? "";
  const [data, setData] = useState<WaiverValidateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);

  const runValidate = useCallback(() => {
    if (!token && !group && !qr) {
      setInvalid("Missing signing link. Please use the link from your email, group invite, or QR code.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = qr
      ? `qr=${encodeURIComponent(qr)}`
      : group
        ? `group=${encodeURIComponent(group)}`
        : `token=${encodeURIComponent(token)}`;
    fetch(`/api/waiver/signing/validate?${query}`)
      .then(async (res) => {
        const text = await res.text();
        let json: {
          valid?: unknown;
          waiverRequestId?: unknown;
          isGroupSigning?: unknown;
          isQrLinkSigning?: unknown;
          error?: string;
        };
        try {
          json = text ? (JSON.parse(text) as typeof json) : {};
        } catch {
          throw new Error(
            res.ok
              ? "Could not read server response."
              : `Server error (${res.status}). Please try again or contact the business.`
          );
        }
        if (!res.ok && !json.error) {
          throw new Error(json.error ?? `Server error (${res.status}). Please try again.`);
        }
        return json;
      })
      .then((json) => {
        if (json.valid && (json.waiverRequestId !== undefined || json.isGroupSigning || json.isQrLinkSigning)) {
          setData(json as WaiverValidateResponse);
          setInvalid(null);
        } else {
          setInvalid(json.error ?? "This link is invalid or has expired.");
          setData(null);
        }
      })
      .catch((e) => {
        setInvalid(e instanceof Error ? e.message : "Could not load waiver. Please try again.");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [token, group, qr]);

  useEffect(() => {
    runValidate();
  }, [runValidate]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-brand-muted">Loading…</p>
      </div>
    );
  }

  if (invalid || !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-brand-dark mb-2">Invalid or expired link</h1>
          <p className="text-brand-muted">{invalid}</p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              type="button"
              onClick={() => {
                setInvalid(null);
                setLoading(true);
                runValidate();
              }}
              className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              Retry
            </button>
          </div>
          <p className="mt-4 text-sm text-brand-muted">
            If you need a new link, please contact the business or book again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto w-full min-w-0 max-w-lg px-4 py-6 sm:py-8">
      <WaiverSigningWizard data={data} token={token || undefined} />
    </div>
  );
}
