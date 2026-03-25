import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Syne } from "next/font/google";
import { headers } from "next/headers";
import { getGaMeasurementId } from "@/lib/ga-measurement-id";
import { isStripeCheckoutReady } from "@/lib/booking/stripe-publishable";
import "./globals.css";

/** Must match `RELEASE_TRAIN` in `@stripe/stripe-js` so `loadStripe()` reuses this tag (CSP + strict-dynamic). */
const STRIPE_JS_SRC = "https://js.stripe.com/clover/stripe.js";

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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={syne.variable}>
      <body>
        {/* Nonce on entry scripts so gtag can propagate it to dynamically inserted script tags (Google Tag / GA4). */}
        {isStripeCheckoutReady ? (
          <Script id="stripe-js" src={STRIPE_JS_SRC} strategy="beforeInteractive" nonce={nonce} />
        ) : null}
        {gaMeasurementId ? (
          <>
            <Script
              id="ga-gtag"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
              nonce={nonce}
            />
            <Script id="ga-bootstrap" src="/gtag-bootstrap" strategy="afterInteractive" nonce={nonce} />
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
