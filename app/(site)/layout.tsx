import type { Metadata } from "next";
import { cookies } from "next/headers";
import { brand } from "@/content/brand";
import { locationAggregateRating } from "@/content/location";
import { SiteChrome } from "@/components/site/SiteChrome";
import { CommercialPageSchema } from "@/components/site/CommercialPageSchema";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-auth-constants";

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
    "boat rental austin",
    "boat rental austin tx",
    "austin party boat",
    "pontoon boat rental austin",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: brand.companyName,
    /** Default share preview: pontoon cover so link previews (e.g. text/SMS) show the pontoon, not the most-popular badge. */
    images: [{ url: "/photos/IMG_3160.webp", width: 1200, height: 630, alt: "Lake Austin pontoon – Boat Bros ATX" }],
  },
  twitter: {
    card: "summary_large_image",
    /** Same image for Twitter/DMs so shared links show pontoon cover. */
    images: ["/photos/IMG_3160.webp"],
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
    aggregateRating: locationAggregateRating(),
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

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = JSON.stringify(localBusinessJsonLd());
  const cookieStore = await cookies();
  const adminSessionCookiePresent = Boolean(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  return (
    <>
      <CommercialPageSchema jsonLd={jsonLd} />
      <SiteChrome adminSessionCookiePresent={adminSessionCookiePresent}>{children}</SiteChrome>
    </>
  );
}
