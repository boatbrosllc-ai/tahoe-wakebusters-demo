import type { Metadata } from "next";
import { cookies } from "next/headers";
import { brand } from "@/content/brand";
import { locationAggregateRating } from "@/content/location";
import { SiteChrome } from "@/components/site/SiteChrome";
import { CommercialPageSchema } from "@/components/site/CommercialPageSchema";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-auth-constants";
import { buildLocalBusinessJsonLd } from "@/lib/seo/public-contact";
import { getSiteBaseUrl, siteConfig } from "@/config/site";

const baseUrl = getSiteBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${brand.companyName} | Private Boat Rentals`,
    template: `%s | ${brand.companyName}`,
  },
  description: siteConfig.seo.description,
  keywords: [...siteConfig.seo.keywords, brand.companyName],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: brand.companyName,
    images: [
      {
        url: siteConfig.seo.defaultOgImage,
        width: 1200,
        height: 630,
        alt: siteConfig.seo.defaultOgImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [siteConfig.seo.defaultOgImage],
  },
  robots: "index, follow",
};

function localBusinessJsonLd() {
  return buildLocalBusinessJsonLd({
    baseUrl,
    description: siteConfig.seo.description,
    aggregateRating: locationAggregateRating(),
  });
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
