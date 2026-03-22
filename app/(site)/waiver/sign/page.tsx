"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { WaiverSigningWizard } from "@/components/waiver/WaiverSigningWizard";
import type { WaiverValidateResponse } from "@/lib/waiver/types";

export default function WaiverSignPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const group = searchParams.get("group")?.trim() ?? "";
  const [data, setData] = useState<WaiverValidateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);

  useEffect(() => {
    if (!token && !group) {
      setInvalid("Missing signing link. Please use the link from your email or from your group.");
      setLoading(false);
      return;
    }
    const query = group ? `group=${encodeURIComponent(group)}` : `token=${encodeURIComponent(token)}`;
    fetch(`/api/waiver/signing/validate?${query}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.valid && (json.waiverRequestId !== undefined || json.isGroupSigning)) {
          setData(json as WaiverValidateResponse);
        } else {
          setInvalid(json.error ?? "This link is invalid or has expired.");
        }
      })
      .catch(() => setInvalid("Could not load waiver. Please try again."))
      .finally(() => setLoading(false));
  }, [token, group]);

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
