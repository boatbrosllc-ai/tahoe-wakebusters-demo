"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MobileStickyBar } from "@/components/site/MobileStickyBar";
import { NavProgress } from "@/components/site/NavProgress";
import { BookingModalProvider } from "@/components/site/BookingModalContext";
import { BookingPreload } from "@/components/site/BookingPreload";
import { cn } from "@/lib/utils";

export function SiteChrome({
  children,
  adminSessionCookiePresent = false,
}: {
  children: React.ReactNode;
  /** Server-read: admin session cookie present — client may still verify via GET /api/admin/session. */
  adminSessionCookiePresent?: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  /** Minimal chrome: no sticky CTA bar or extra bottom spacer (stepper controls need clear tap targets). */
  const isWaiverSigning = pathname?.startsWith("/waiver/sign") ?? false;

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <BookingModalProvider>
      {/* ViewTransitions is intentionally not mounted here: NavProgress already handles route feedback; opt-in later to avoid duplicate capture-phase link handlers. */}
      <BookingPreload />
      <NavProgress />
      <div className="min-h-screen flex flex-col">
        <Header adminSessionCookiePresent={adminSessionCookiePresent} />
        <main
          className={cn(
            "flex-1",
            isWaiverSigning ? "pb-6 sm:pb-8" : "pb-[72px] lg:pb-0"
          )}
        >
          {children}
        </main>
        <Footer />
        {!isWaiverSigning && <MobileStickyBar />}
      </div>
      {/* Spacer for mobile bottom nav – match footer bg so no white strip */}
      {!isWaiverSigning && <div className="h-24 lg:hidden bg-brand-dark" aria-hidden />}
    </BookingModalProvider>
  );
}
