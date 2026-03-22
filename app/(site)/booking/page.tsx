import { BookingPageClient } from "./BookingPageClient";

import { BookingStripeReturnHandler } from "./BookingStripeReturnHandler";

type SearchParams = {
  experience?: string;
  boatId?: string;
  date?: string;
  payment_intent?: string;
  redirect_status?: string;
};

/**
 * Standalone /booking page. Supports deep-link params for experience, boat, and date
 * (e.g. from emails or marketing: /booking?experience=watersports&date=2026-03-20).
 * Renders BookingPageClient with initialSelection from searchParams.
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const params = typeof (searchParams as Promise<SearchParams>).then === "function"
    ? await (searchParams as Promise<SearchParams>)
    : (searchParams as SearchParams);

  const piId = params.payment_intent ?? (params as { payment_intent_id?: string }).payment_intent_id;
  const rs = params.redirect_status;
  if (piId && rs && (rs === "succeeded" || rs === "failed")) {
    return <BookingStripeReturnHandler paymentIntentId={piId} redirectStatus={rs} />;
  }

  const experience = params.experience;
  const boatId = params.boatId;
  const date = params.date;
  const initialSelection =
    experience || boatId || date
      ? { experience, boatId, date }
      : undefined;
  return <BookingPageClient initialSelection={initialSelection} />;
}
