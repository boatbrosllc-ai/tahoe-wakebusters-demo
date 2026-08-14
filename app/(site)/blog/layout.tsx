import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { getSiteBaseUrl } from "@/config/site";


const baseUrl = getSiteBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "The Bite | Cabo Fishing Tips & Guides",
  description:
    `Cabo fishing tips, charter guides, and bite notes from ${brand.companyName} — seasons, species, and trip prep for Cabo San Lucas.`,
  keywords: [
    "Cabo fishing blog",
    "Cabo fishing tips",
    "Cabo San Lucas fishing guides",
    "sport fishing Cabo",
  ],
  openGraph: {
    title: `The Bite | Cabo Fishing Tips & Guides | ${brand.companyName}`,
    description:
      `Cabo fishing tips, charter guides, and bite notes from ${brand.companyName}.`,
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
