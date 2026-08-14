import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { getSiteBaseUrl } from "@/config/site";


const baseUrl = getSiteBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Blog | Tips & Guides",
  description:
    `Tips, charter guides, and trip notes from ${brand.companyName}.`,
  keywords: [
    "boat rental blog",
    "charter tips",
    "trip guides",
  ],
  openGraph: {
    title: `Blog | ${brand.companyName}`,
    description:
      `Tips, charter guides, and trip notes from ${brand.companyName}.`,
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
