"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WaiversPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/waivers/templates");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <p className="text-brand-muted">Redirecting…</p>
    </div>
  );
}
