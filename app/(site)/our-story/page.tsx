import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { OurStoryPageClient } from "@/components/site/OurStoryPageClient";
import { getSiteBaseUrl, siteConfig } from "@/config/site";

const baseUrl = getSiteBaseUrl();
const canonical = `${baseUrl}/our-story`;
const ogImage = siteConfig.seo.defaultOgImage;

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "We're Jarod and Bobby Minghini — Tahoe locals who grew up on this lake. Tahoe Wakebusters exists to give every guest the best possible day on the water.",
  keywords: [brand.companyName, "Jarod Minghini", "Bobby Minghini", "South Lake Tahoe boat rentals"],
  alternates: { canonical },
  openGraph: {
    title: `Our Story | ${brand.companyName}`,
    description: "Brothers. Locals. Lake Obsessed. Family-owned Lake Tahoe boat rentals from Tahoe Keys Marina.",
    url: canonical,
    images: [
      {
        url: ogImage,
        width: 1800,
        height: 2400,
        alt: "Jarod and Bobby Minghini, founders of Tahoe Wakebusters boat rentals in South Lake Tahoe",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Our Story | ${brand.companyName}`,
    description: "Brothers. Locals. Lake Obsessed. Family-owned Lake Tahoe boat rentals from Tahoe Keys Marina.",
    images: [ogImage],
  },
};

export default function OurStoryPage() {
  return <OurStoryPageClient />;
}
