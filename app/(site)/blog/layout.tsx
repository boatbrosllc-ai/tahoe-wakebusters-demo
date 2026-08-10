import type { Metadata } from "next";
import { brand } from "@/content/brand";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "The Bite | Cabo Fishing Tips & Guides",
  description:
    "Cabo fishing tips, charter guides, and bite notes from Nasty Sport Fishing — seasons, species, and trip prep for Cabo San Lucas.",
  keywords: [
    "Cabo fishing blog",
    "Cabo fishing tips",
    "Cabo San Lucas fishing guides",
    "sport fishing Cabo",
  ],
  openGraph: {
    title: `The Bite | Cabo Fishing Tips & Guides | ${brand.companyName}`,
    description:
      "Cabo fishing tips, charter guides, and bite notes from Nasty Sport Fishing.",
    url: `${baseUrl}/blog`,
    type: "website",
  },
  alternates: { canonical: `${baseUrl}/blog` },
  robots: "index, follow",
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
