import type { Metadata } from "next";
import { OurStoryPageClient } from "@/components/site/OurStoryPageClient";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/our-story`;
const ogImage = "/photos/nsf/our-story-crew.jpg";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Our Story | Cabo San Lucas Sport Fishing",
  description:
    "We didn’t come to Cabo to build another fishing charter. Nasty Sport Fishing is private Cabo charters built around the bite — serious fishing, no tourist package.",
  keywords: [
    "Nasty Sport Fishing",
    "Cabo San Lucas sport fishing",
    "Cabo fishing charter story",
    "Los Cabos fishing",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Our Story | Nasty Sport Fishing",
    description: "Come to Cabo to fish. Private Cabo charters. Serious fishing. No bullshit.",
    url: canonical,
    images: [
      {
        url: ogImage,
        width: 1800,
        height: 2400,
        alt: "Nasty Sport Fishing angler with twin yellowfin tuna on deck in Cabo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Our Story | Nasty Sport Fishing",
    description: "Come to Cabo to fish. Private Cabo charters. Serious fishing. No bullshit.",
    images: [ogImage],
  },
};

export default function OurStoryPage() {
  return <OurStoryPageClient />;
}
