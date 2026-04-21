"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { brand } from "@/content/brand";
import { Printer } from "lucide-react";

export default function QrPrintSheetPage() {
  const params = useParams();
  const qrId = params.qrId as string;
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qrId) return;
    fetch(`/api/admin/waiver-qr-links/${qrId}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed");
        return data as {
          templateTitle?: string;
          link?: { label?: string; assignedBoat?: string };
        };
      })
      .then((d) => {
        setTitle(d.templateTitle ?? "Sign waiver");
        const parts = [d.link?.label, d.link?.assignedBoat].filter(Boolean);
        setSubtitle(parts.length > 0 ? parts.join(" · ") : "");
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [qrId]);

  return (
    <div className="min-h-screen bg-white text-brand-dark print:bg-white">
      <div className="max-w-lg mx-auto px-6 py-10 print:hidden flex items-center justify-between gap-4">
        <Link href={`/admin/waivers/templates`} className="text-sm text-brand-muted hover:text-brand-dark">
          ← Templates
        </Link>
        <Button type="button" onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" aria-hidden />
          Print
        </Button>
      </div>

      {loading && <p className="text-center print:hidden text-brand-muted">Loading…</p>}
      {error && <p className="text-center print:hidden text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="max-w-md mx-auto px-8 py-12 print:py-10 print:max-w-none flex flex-col items-center text-center space-y-8 border border-brand-dark/10 rounded-3xl print:border-0 shadow-sm print:shadow-none mx-4 print:mx-12">
          <div>
            <Image src={brand.logoPath} alt={brand.logoAlt} width={240} height={72} className="h-14 w-auto mx-auto object-contain" priority />
            <p className="mt-4 text-xl font-semibold tracking-tight text-brand-dark">{brand.companyName}</p>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-brand-dark leading-tight">{title}</h1>
            <p className="text-lg text-brand-muted">Scan to Sign Waiver</p>
            {subtitle && <p className="text-sm text-brand-dark/80">{subtitle}</p>}
          </div>

          <div className="rounded-3xl border-2 border-brand-dark/15 p-6 bg-white">
            <Image
              src={`/api/admin/waiver-qr-links/${qrId}/image?format=png`}
              alt=""
              width={280}
              height={280}
              className="w-[280px] h-[280px]"
              unoptimized
            />
          </div>

          <p className="text-xs text-brand-muted max-w-xs leading-relaxed">
            Point your camera at the code to open the secure signing page on your phone.
          </p>
        </div>
      )}
    </div>
  );
}
