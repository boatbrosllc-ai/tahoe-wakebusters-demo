import type { Metadata } from "next";
import { cookies } from "next/headers";
import { brand } from "@/content/brand";
import { locationAggregateRating } from "@/content/location";
import { SiteChrome } from "@/components/site/SiteChrome";
import { CommercialPageSchema } from "@/components/site/CommercialPageSchema";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-auth-constants";
import { buildLocalBusinessJsonLd } from "@/lib/seo/public-contact";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${brand.companyName} | Cabo San Lucas Sport Fishing`,
    template: `%s | ${brand.companyName}`,
  },
  description:
    "Cabo San Lucas sport fishing charters — marlin, tuna, dorado & wahoo. Licensed captain & crew. Book your trip. Nasty Sport Fishing.",
  keywords: [
    "Cabo San Lucas sport fishing",
    "Cabo fishing charters",
    "marlin fishing Cabo",
    "tuna fishing Cabo San Lucas",
    "dorado fishing Los Cabos",
    "wahoo fishing Cabo",
    "deep sea fishing Cabo",
    "sport fishing Cabo San Lucas",
    "private fishing charter Cabo",
    "Nasty Sport Fishing",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: brand.companyName,
    /** Default share preview: Cabo El Arco sunset. */
    images: [
      {
        url: "/photos/stock/cabo/el-arco-sunset-jarvis.jpg",
        width: 1200,
        height: 630,
        alt: "El Arco at sunset – Nasty Sport Fishing Cabo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/photos/stock/cabo/el-arco-sunset-jarvis.jpg"],
  },
  robots: "index, follow",
};

function localBusinessJsonLd() {
  return buildLocalBusinessJsonLd({
    baseUrl,
    description:
      "Cabo San Lucas sport fishing charters: marlin, tuna, dorado, and wahoo. Licensed captain and crew. Book online.",
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
