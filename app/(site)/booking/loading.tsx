/**
 * Booking flow loading — shown while booking page segment loads.
 */
export default function BookingLoading() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-5 py-16">
      <div className="w-10 h-10 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      <p className="mt-3 text-sm text-brand-muted">Loading…</p>
    </div>
  );
}
