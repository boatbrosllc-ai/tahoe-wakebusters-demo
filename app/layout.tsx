import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { Syne } from "next/font/google";
import { getGaMeasurementId } from "@/lib/ga-measurement-id";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

/** Prevents mobile "zoom" issues: device-width + initial scale so checkout/form layout stays clean. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /** Android Chrome: resize layout when virtual keyboard opens so inputs stay in view. */
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaMeasurementId = getGaMeasurementId();
  const headersList = await headers();
  /** Required by middleware CSP `script-src 'nonce-…'`; omitting it blocks the inline gtag bootstrap. */
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={syne.variable}>
      <head>
        <link rel="preload" as="image" href="/videos/hero-poster.jpg" />
      </head>
      <body>
        {gaMeasurementId && nonce ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
              nonce={nonce}
            />
            <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}');
              `}
            </Script>
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
