import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Syne } from "next/font/google";
import { headers } from "next/headers";
import { getGaMeasurementId, isGaClientDebugEnabled } from "@/lib/ga-measurement-id";
import { getGoogleAdsId } from "@/lib/google-ads-id";
import { getGtagInlineBootstrapJs } from "@/lib/ga-gtag-inline";
import { isStripeCheckoutReady } from "@/lib/booking/stripe-publishable";
import { GaPageViewTracker } from "@/components/providers/GaPageViewTracker";
import "./globals.css";
import { getSiteBaseUrl, siteConfig, siteThemeCssVars } from "@/config/site";


/** Must match `RELEASE_TRAIN` in `@stripe/stripe-js` so `loadStripe()` reuses this tag (CSP + strict-dynamic). */
const STRIPE_JS_SRC = "https://js.stripe.com/clover/stripe.js";

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  preload: true,
});

const displayFont = syne;

let didLogGaSkip = false;

export const metadata: Metadata = {
  metadataBase: new URL(getSiteBaseUrl()),
  icons: {
    icon: [
      { url: siteConfig.branding.favicon, type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: siteConfig.branding.favicon,
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
  const googleAdsId = getGoogleAdsId();
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
    <html
      lang="en"
      className={displayFont.variable}
      style={siteThemeCssVars() as CSSProperties}
    >
      <body>
        {/* Stripe.js: loaded early in layout; CSP nonce + strict-dynamic. */}
        {isStripeCheckoutReady ? (
          <script src={STRIPE_JS_SRC} async nonce={nonce} suppressHydrationWarning />
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
                __html: getGtagInlineBootstrapJs(gaMeasurementId, {
                  debugMode: gaDebugMode,
                  googleAdsId,
                }),
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
