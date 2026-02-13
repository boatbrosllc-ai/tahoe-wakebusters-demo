import { Suspense } from "react";
import { ManageBookingClient } from "./ManageBookingClient";

function ManageBookingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
      <div className="text-brand-muted">Loading…</div>
    </div>
  );
}

export default function ManageBookingPage() {
  return (
    <Suspense fallback={<ManageBookingFallback />}>
      <ManageBookingClient />
    </Suspense>
  );
}
