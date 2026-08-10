import type { Metadata } from "next";
import { PackagesPageClient } from "@/components/site/PackagesPageClient";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/packages`;

export const metadata: Metadata = {
  title: "Cabo Multi-Day Packages | Inquiry Only | Nasty Sport Fishing",
  description:
    "Bachelor Blowout, Corporate Retreat, Nasty Cabo Week, and Tournament Week — coordinated Cabo packages. Inquiry only; partner-fulfilled lodging and logistics.",
  alternates: { canonical },
  openGraph: {
    title: "Cabo Multi-Day Packages | Nasty Sport Fishing",
    description:
      "Inquiry-only multi-day Cabo packages — bachelor, corporate, week-long, and tournament itineraries coordinated by Nasty.",
    url: canonical,
  },
};

export default function PackagesInquiryPage() {
  return <PackagesPageClient />;
}
