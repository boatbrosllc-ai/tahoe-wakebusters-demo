import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { SiteChrome } from "@/components/site/SiteChrome";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${brand.companyName} | Lake Austin Boat Rentals | Austin TX`,
    template: `%s | ${brand.companyName}`,
  },
  description:
    "Lake Austin boat rentals — pontoon, wake surf, sunset cruises. Captained charters. Book online. Boat Bros ATX, Austin TX.",
  keywords: [
    "Lake Austin boat rentals",
    "boat rentals Lake Austin",
    "Lake Austin pontoon rentals",
    "pontoon rental Lake Austin",
    "Lake Austin wake boat",
    "Lake Austin sunset cruise",
  ],
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
    description:
      "Lake Austin boat rentals: pontoon rentals, wake boat and wake surf, sunset cruises. Captained charters on Lake Austin, Austin TX. Book online.",
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
    areaServed: [{ "@type": "Place", name: "Lake Austin, Austin TX" }],
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "08:00",
      closes: "20:00",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Lake Austin boat rental experiences",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Lake Austin pontoon rental" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Lake Austin wake boat and wake surf rental" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Lake Austin sunset cruise" } },
      ],
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
