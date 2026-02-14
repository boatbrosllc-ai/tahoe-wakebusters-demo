import type { Metadata } from "next";
import { brand } from "@/content/brand";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: `The Dock | Boat Tips, Austin Events & Lake News | ${brand.companyName}`,
  description:
    "The Dock: boat tips, Austin events, and lake & boating news from Boat Bros. Get the most out of your Lake Austin boat rental—what to bring, best coves, and more.",
  keywords: [
    "Lake Austin blog",
    "boat tips Austin",
    "Austin lake events",
    "Lake Austin news",
    "boat rental tips",
  ],
  openGraph: {
    title: `The Dock | Boat Tips, Austin Events & Lake News | ${brand.companyName}`,
    description:
      "Boat tips, Austin events, and lake & boating news from Boat Bros. Get the most out of your Lake Austin boat rental.",
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
