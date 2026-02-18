import Link from "next/link";

export default function WaiverSignSuccessPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6" aria-hidden>
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-brand-dark mb-2">Signed & completed</h1>
        <p className="text-brand-muted mb-6">
          Your waiver has been signed successfully. You’re all set for your trip.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-brand-primary px-6 py-3 text-base font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
