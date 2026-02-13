import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { BookingPageClient } from "./BookingPageClient";

export const metadata: Metadata = {
  title: "Book a boat",
  description: `Book your Lake Austin boat rental. Choose your date, time, and duration. ${brand.companyName}, Austin TX.`,
};

export default function BookingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-bg via-white to-brand-bg/50">
      <BookingPageClient />
    </div>
  );
}
