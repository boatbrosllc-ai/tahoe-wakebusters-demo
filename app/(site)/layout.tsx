import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { SiteChrome } from "@/components/site/SiteChrome";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${brand.companyName} | Lake Travis & Lake Austin Boat Rentals | Austin TX`,
    template: `%s | ${brand.companyName}`,
  },
  description:
    "Premium boat rentals on Lake Travis and Lake Austin, Austin TX. Pontoon parties, wake & surf, sunset cruises, family days & corporate outings. Local crew, easy booking.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: brand.companyName,
  },
  robots: "index, follow",
};

function localBusinessJsonLd() {
  const address = `${brand.address.line1}, ${brand.address.city}, ${brand.address.state} ${brand.address.zip}`;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: brand.companyName,
    description: brand.tagline,
    url: baseUrl,
    telephone: brand.phoneTel,
    email: brand.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: brand.address.line1,
      addressLocality: brand.address.city,
      addressRegion: brand.address.state,
      postalCode: brand.address.zip,
    },
    areaServed: [
      { "@type": "Place", name: "Lake Travis, Austin TX" },
      { "@type": "Place", name: "Lake Austin, Austin TX" },
    ],
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "08:00",
      closes: "20:00",
    },
  };
}

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = localBusinessJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteChrome>{children}</SiteChrome>
    </>
  );
}
