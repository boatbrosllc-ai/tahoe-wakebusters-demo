"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Phone, User, LayoutDashboard, ChevronDown } from "lucide-react";
import { brand } from "@/content/brand";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn } from "@/lib/utils";
import { revalidateAdminSession, subscribeAdminAuthRevalidate } from "@/lib/admin-auth-client";
import BookingModal from "@/components/site/BookingModal";
import { getPublicPhone } from "@/lib/seo/public-contact";
import { SiteDockNav } from "@/components/site/SiteDockNav";
import { SiteDesktopNav } from "@/components/site/SiteDesktopNav";
import { isPlatformDevBannerEnabled } from "@/config/site";

function documentHasAdminSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)admin_session=/.test(document.cookie);
}

/**
 * Desktop: NavigationMenu mega-nav.
 * Mobile: slim top bar + floating Dock.
 */
export function Header({ adminSessionCookiePresent = false }: { adminSessionCookiePresent?: boolean }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const bannerOffset = isPlatformDevBannerEnabled();
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(() =>
    adminSessionCookiePresent ? null : false,
  );
  const accountRef = useRef<HTMLDivElement>(null);
  const {
    open: bookingModalOpen,
    setOpen: setBookingModalOpen,
    initialSelection,
    selectionKey,
    openWithSelection,
  } = useBookingModal();
  const [hasOpenedBookingModal, setHasOpenedBookingModal] = useState(false);

  useEffect(() => {
    if (bookingModalOpen) setHasOpenedBookingModal(true);
  }, [bookingModalOpen]);

  const handleCallClick = () => analytics.callClick("header", "global");
  const phone = getPublicPhone();

  const applySessionState = (s: Awaited<ReturnType<typeof revalidateAdminSession>>) => {
    if (s.status === "unavailable") return;
    setIsAdmin(s.status === "signed_in");
  };

  useEffect(() => {
    const hasCookie =
      adminSessionCookiePresent ||
      (typeof document !== "undefined" && documentHasAdminSessionCookie());
    if (!hasCookie) {
      setIsAdmin(false);
      return;
    }
    void revalidateAdminSession().then(applySessionState);
  }, [adminSessionCookiePresent]);

  useEffect(() => {
    const cookiePresent =
      adminSessionCookiePresent ||
      (typeof document !== "undefined" && documentHasAdminSessionCookie());
    if (!cookiePresent && isAdmin !== true) return;
    return subscribeAdminAuthRevalidate(() => {
      void revalidateAdminSession().then(applySessionState);
    });
  }, [adminSessionCookiePresent, isAdmin]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [accountOpen]);

  const overlay = isHome && !scrolled;

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-50 px-3 sm:px-4 lg:px-5",
          "transition-[top] duration-300",
          bannerOffset ? "top-10" : "top-3"
        )}
      >
        <header
          data-site-header
          className={cn(
            "pointer-events-auto relative mx-auto flex w-full items-center",
            "h-[5.5rem] sm:h-24 lg:h-[6.5rem]",
            "gap-2 rounded-full px-5 sm:px-7 lg:px-8 xl:px-10",
            "transition-[background-color,border-color,box-shadow] duration-300",
            overlay
              ? "border border-white/25 bg-transparent shadow-none"
              : "border border-white/25 bg-brand-primary shadow-[0_12px_40px_-12px_rgba(10,22,40,0.45)]"
          )}
        >
          {overlay ? (
            <div
              className="pointer-events-none absolute inset-0 rounded-full bg-white/10 backdrop-blur-md"
              aria-hidden
            />
          ) : null}

          <div className="relative z-10 flex min-w-0 flex-1 items-center justify-start">
            <Link
              href="/"
              className="flex min-w-0 items-center rounded-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={`${brand.companyName} home`}
            >
              <Image
                src={brand.logoNavbarPath ?? brand.logoPath}
                alt={brand.logoAlt}
                width={360}
                height={180}
                className="h-12 w-auto max-w-[160px] object-contain object-left sm:h-14 sm:max-w-[220px] lg:h-14 lg:max-w-[240px] xl:h-16 xl:max-w-[280px]"
                sizes="(max-width: 640px) 180px, (max-width: 1023px) 240px, 320px"
                priority
                fetchPriority="high"
                unoptimized
              />
            </Link>
          </div>

          <div className="relative z-10 hidden min-w-0 shrink items-center justify-center lg:flex">
            <SiteDesktopNav />
          </div>

          <div className="relative z-10 flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-1.5 lg:gap-2">
            {phone ? (
              <a
                href={`tel:${phone.tel}`}
                onClick={handleCallClick}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/20 hover:text-white"
                aria-label={`Call ${phone.display}`}
              >
                <Phone className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
              </a>
            ) : (
              <Link
                href="/contact"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Contact us"
              >
                <Phone className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
              </Link>
            )}

            {isAdmin && (
              <div className="relative shrink-0" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white hover:bg-white/20 lg:h-12 lg:w-auto lg:gap-1 lg:px-3"
                  aria-label="Account menu"
                  aria-haspopup="true"
                >
                  <User className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                  <ChevronDown
                    className={cn(
                      "ml-0.5 hidden h-4 w-4 opacity-80 transition-transform lg:block",
                      accountOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
                {accountOpen && (
                  <div className="absolute right-0 top-full z-[100] mt-1 min-w-[200px] rounded-xl border border-brand-dark/10 bg-white py-1 shadow-lg">
                    <Link
                      href="/admin"
                      className="flex items-center gap-2 px-4 py-3.5 text-base font-medium text-brand-dark hover:bg-brand-bg"
                      onClick={() => setAccountOpen(false)}
                    >
                      <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
                      Dashboard
                    </Link>
                  </div>
                )}
              </div>
            )}

            <Button
              type="button"
              variant="default"
              size="lg"
              className={cn(
                "hidden shrink-0 rounded-xl sm:inline-flex",
                "h-11 min-w-[6rem] px-4 text-sm font-semibold sm:h-12 sm:min-w-[6.5rem] sm:px-5 sm:text-base"
              )}
              onClick={() => setBookingModalOpen(true)}
            >
              Book now
            </Button>
          </div>
        </header>
      </div>
      {!isHome ? <div className="h-32 shrink-0" aria-hidden /> : null}

      {/* Mobile-only dock nav */}
      <SiteDockNav />

      {(bookingModalOpen || hasOpenedBookingModal) && (
        <BookingModal
          open={bookingModalOpen}
          onOpenChange={setBookingModalOpen}
          initialSelection={initialSelection}
          selectionKey={selectionKey}
          onBookAnother={() => {
            setBookingModalOpen(false);
            queueMicrotask(() => openWithSelection({}));
          }}
        />
      )}
    </>
  );
}
