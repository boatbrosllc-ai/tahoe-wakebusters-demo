import Link from "next/link";

/** Shown when Firebase session verification fails transiently (503-style); do not redirect to login. */
export function AdminVerificationUnavailable() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-brand-dark">Admin temporarily unavailable</h1>
        <p className="mt-2 text-sm text-brand-muted">
          We couldn&apos;t verify your session with Firebase right now. This is usually brief. Wait a moment and refresh the page.
        </p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            href="/admin"
            className="font-medium text-brand-primary hover:underline"
          >
            Retry
          </Link>
          <span className="text-brand-muted">·</span>
          <Link href="/" className="text-brand-muted hover:text-brand-dark hover:underline">
            Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}
