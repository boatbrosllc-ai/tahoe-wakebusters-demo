import { redirect } from "next/navigation";

/**
 * Standalone /booking is deprecated. Booking is done via the Book now modal on experiences and other pages.
 * Redirect to experiences so users can book from there.
 */
export default function BookingPage() {
  redirect("/experiences");
}
