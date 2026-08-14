import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { PackagesPageClient } from "@/components/site/PackagesPageClient";
import { getSiteBaseUrl } from "@/config/site";


const baseUrl = getSiteBaseUrl();
const canonical = `${baseUrl}/packages`;

export const metadata: Metadata = {
  title: `Cabo Multi-Day Packages | Inquiry Only | ${brand.companyName}`,
  description:
    "Bachelor Blowout, Corporate Retreat, Nasty Cabo Week, and Tournament Week — coordinated Cabo packages. Inquiry only; partner-fulfilled lodging and logistics.",
  alternates: { canonical },
  openGraph: {
    title: `Cabo Multi-Day Packages | ${brand.companyName}`,
    description:
      "Inquiry-only multi-day Cabo packages — bachelor, corporate, week-long, and tournament itineraries coordinated by Nasty.",
    url: canonical,
  },
};

export default function PackagesInquiryPage() {
  return <PackagesPageClient />;
}
