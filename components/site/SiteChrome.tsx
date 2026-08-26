"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { PlatformDevBanner } from "@/components/site/PlatformDevBanner";
import { NavProgress } from "@/components/site/NavProgress";
import { BookingModalProvider } from "@/components/site/BookingModalContext";
import { BookingPreload } from "@/components/site/BookingPreload";
import { cn } from "@/lib/utils";

function SiteChromeInner({
  children,
  adminSessionCookiePresent = false,
}: {
  children: React.ReactNode;
  adminSessionCookiePresent?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = pathname?.startsWith("/admin");
  /** Minimal chrome: no sticky CTA bar or extra bottom spacer (stepper controls need clear tap targets). */
  const isWaiverSigning = pathname?.startsWith("/waiver/sign") ?? false;
  const isWaiverSuccess = pathname === "/waiver/sign/success";
  const isKiosk =
    isWaiverSigning &&
    !isWaiverSuccess &&
    searchParams.get("mode") === "kiosk";

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isKiosk) {
    return (
      <BookingModalProvider>
        <div className="min-h-screen flex flex-col bg-white">
          <main className="flex-1 min-h-0 pb-[calc(72px+env(safe-area-inset-bottom,0px))] sm:pb-10">{children}</main>
        </div>
      </BookingModalProvider>
    );
  }

  return (
    <BookingModalProvider>
      {/* ViewTransitions is intentionally not mounted here: NavProgress already handles route feedback; opt-in later to avoid duplicate capture-phase link handlers. */}
      <BookingPreload />
      <NavProgress />
      <div className="min-h-screen flex flex-col">
        <PlatformDevBanner />
        <Header adminSessionCookiePresent={adminSessionCookiePresent} />
        <main
          className={cn(
            "flex-1 min-h-0",
            /* Footer uses mt-[-72px] on mobile; waiver omitted MobileStickyBar but still needs the same bottom band so step CTAs are not covered */
            isWaiverSigning
              ? "pb-[calc(72px+env(safe-area-inset-bottom,0px))] sm:pb-12 lg:pb-14"
              : "pb-[116px] lg:pb-0"
          )}
        >
          {children}
        </main>
        <Footer />
      </div>
      {/* Spacer for mobile dock nav */}
      {!isWaiverSigning && <div className="h-32 lg:hidden bg-[#F0F0F0]" aria-hidden />}
    </BookingModalProvider>
  );
}

export function SiteChrome({
  children,
  adminSessionCookiePresent = false,
}: {
  children: React.ReactNode;
  /** Server-read: admin session cookie present — client may still verify via GET /api/admin/session. */
  adminSessionCookiePresent?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <BookingModalProvider>
          <div className="min-h-screen flex flex-col">
            <Header adminSessionCookiePresent={adminSessionCookiePresent} />
            <main className="flex-1 min-h-0">{children}</main>
            <Footer />
          </div>
        </BookingModalProvider>
      }
    >
      <SiteChromeInner adminSessionCookiePresent={adminSessionCookiePresent}>{children}</SiteChromeInner>
    </Suspense>
  );
}
