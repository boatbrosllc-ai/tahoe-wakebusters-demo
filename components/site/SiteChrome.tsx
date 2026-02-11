"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MobileStickyBar } from "@/components/site/MobileStickyBar";
import { BookingModalProvider } from "@/components/site/BookingModalContext";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <BookingModalProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 pb-[72px] lg:pb-0">{children}</main>
        <Footer />
        <MobileStickyBar />
      </div>
      {/* Spacer for mobile bottom nav – match footer bg so no white strip */}
      <div className="h-24 lg:hidden bg-brand-dark" aria-hidden />
    </BookingModalProvider>
  );
}
