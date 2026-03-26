import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Syne } from "next/font/google";
import { headers } from "next/headers";
import { getGaMeasurementId, isGaClientDebugEnabled } from "@/lib/ga-measurement-id";
import { getGtagInlineBootstrapJs } from "@/lib/ga-gtag-inline";
import { isStripeCheckoutReady } from "@/lib/booking/stripe-publishable";
import { GaPageViewTracker } from "@/components/providers/GaPageViewTracker";
import "./globals.css";

/** Must match `RELEASE_TRAIN` in `@stripe/stripe-js` so `loadStripe()` reuses this tag (CSP + strict-dynamic). */
const STRIPE_JS_SRC = "https://js.stripe.com/clover/stripe.js";

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  preload: true,
});

let didLogGaSkip = false;

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
  const gaDebugMode = isGaClientDebugEnabled();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  if (!gaMeasurementId && !didLogGaSkip) {
    didLogGaSkip = true;
    const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    const trimmed = raw == null ? "(unset)" : raw.trim();
    const prodHint =
      process.env.NODE_ENV === "production"
        ? " Production requires an explicit valid NEXT_PUBLIC_GA_MEASUREMENT_ID (no fallback)."
        : "";
    console.warn(
      `[ga] Skipping GA injection in app/layout.tsx. NEXT_PUBLIC_GA_MEASUREMENT_ID is empty/disabled/malformed (value: ${JSON.stringify(
        trimmed
      )}).${prodHint}`
    );
  }

  return (
    <html lang="en" className={syne.variable}>
      <body>
        {/* GA4 + CSP: allowlisted googletag* / google-analytics in middleware; nonce on Script tags. */}
        {isStripeCheckoutReady ? (
          <Script id="stripe-js" src={STRIPE_JS_SRC} strategy="beforeInteractive" nonce={nonce} />
        ) : null}
        {gaMeasurementId ? (
          <>
            {/*
              Native <script> tags (nonce + async) match Google’s snippet and avoid relying on
              createElement-injected gtag/js under CSP strict-dynamic (some environments are picky).
            */}
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              nonce={nonce}
            />
            <script
              nonce={nonce}
              suppressHydrationWarning
              dangerouslySetInnerHTML={{
                __html: getGtagInlineBootstrapJs(gaMeasurementId, { debugMode: gaDebugMode }),
              }}
            />
          </>
        ) : null}
        <GaPageViewTracker />
        {children}
      </body>
    </html>
  );
}
