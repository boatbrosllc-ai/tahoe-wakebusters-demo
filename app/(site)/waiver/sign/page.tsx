"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WaiverSigningWizard } from "@/components/waiver/WaiverSigningWizard";
import type { WaiverValidateResponse } from "@/lib/waiver/types";

export default function WaiverSignPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const group = searchParams.get("group")?.trim() ?? "";
  const [data, setData] = useState<WaiverValidateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);

  const runValidate = useCallback(() => {
    if (!token && !group) {
      setInvalid("Missing signing link. Please use the link from your email or from your group.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = group ? `group=${encodeURIComponent(group)}` : `token=${encodeURIComponent(token)}`;
    fetch(`/api/waiver/signing/validate?${query}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.valid && (json.waiverRequestId !== undefined || json.isGroupSigning)) {
          setData(json as WaiverValidateResponse);
          setInvalid(null);
        } else {
          setInvalid(json.error ?? "This link is invalid or has expired.");
          setData(null);
        }
      })
      .catch(() => {
        setInvalid("Could not load waiver. Please try again.");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [token, group]);

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
    <div className="container mx-auto px-4 py-6 sm:py-8 max-w-lg">
      <WaiverSigningWizard data={data} token={token} />
    </div>
  );
}
