import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { BookingPageClient } from "./BookingPageClient";

export const metadata: Metadata = {
  title: "Book Lake Austin Boat Rental",
  description:
    "Book your Lake Austin boat rental — pontoon, wake surf, sunset cruise. Choose date, time, duration. Captain included. Boat Bros ATX.",
  keywords: ["Lake Austin boat rental", "book boat rental Lake Austin", "pontoon rental Lake Austin"],
  openGraph: {
    title: "Book Lake Austin Boat Rental | Boat Bros",
    description: "Book pontoon, wake boat, or sunset cruise on Lake Austin. Captain included.",
  },
};

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ experience?: string; boatId?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const initialSelection = {
    experience: typeof sp.experience === "string" ? sp.experience : undefined,
    boatId: typeof sp.boatId === "string" ? sp.boatId : undefined,
    date: typeof sp.date === "string" ? sp.date : undefined,
  };
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-bg via-white to-brand-bg/50">
      <BookingPageClient initialSelection={initialSelection} />
    </div>
  );
}
