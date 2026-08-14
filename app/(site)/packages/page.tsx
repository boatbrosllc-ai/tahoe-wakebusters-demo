import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { PackagesPageClient } from "@/components/site/PackagesPageClient";
import { getSiteBaseUrl } from "@/config/site";


const baseUrl = getSiteBaseUrl();
const canonical = `${baseUrl}/packages`;

export const metadata: Metadata = {
  title: `Multi-Day Packages | Inquiry Only | ${brand.companyName}`,
  description:
    "Bachelor Blowout, Corporate Retreat, Charter Week, and Tournament Week — coordinated multi-day packages. Inquiry only; partner-fulfilled lodging and logistics.",
  alternates: { canonical },
  openGraph: {
    title: `Multi-Day Packages | ${brand.companyName}`,
    description:
      "Inquiry-only multi-day packages — bachelor, corporate, week-long, and tournament itineraries coordinated by the operator.",
    url: canonical,
  },
};

export default function PackagesInquiryPage() {
  return <PackagesPageClient />;
}
