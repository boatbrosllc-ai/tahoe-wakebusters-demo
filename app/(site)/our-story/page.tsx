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
  description: `${brand.companyName} is a private captained boat rental company. Book your trip online.`,
  keywords: [brand.companyName, "boat rental story", "private boat charter"],
  alternates: { canonical },
  openGraph: {
    title: `Our Story | ${brand.companyName}`,
    description: "Private captained boat rentals. Book online.",
    url: canonical,
    images: [
      {
        url: ogImage,
        width: 1800,
        height: 2400,
        alt: `${brand.companyName} angler with twin yellowfin tuna on deck in Cabo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Our Story | ${brand.companyName}`,
    description: "Come to Cabo to fish. Private Cabo charters. Serious fishing. No bullshit.",
    images: [ogImage],
  },
};

export default function OurStoryPage() {
  return <OurStoryPageClient />;
}
