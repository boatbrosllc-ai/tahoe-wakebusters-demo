/**
 * Global site loading UI — shown during navigation while the new page segment loads.
 * Keeps layout (header/footer); replaces main content with a minimal skeleton so the screen is never blank.
 */
export default function SiteLoading() {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center px-5 py-16"
      aria-hidden
    >
      <div className="w-12 h-12 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      <p className="mt-4 text-sm text-brand-muted">Loading…</p>
    </div>
  );
}
