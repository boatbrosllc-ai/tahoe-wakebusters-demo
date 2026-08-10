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
import { OUR_BOAT_PATH } from "@/content/launch-boat";

const navLinks = [
  { href: "/experiences", label: "Charters" },
  { href: "/packages", label: "Packages" },
  { href: OUR_BOAT_PATH, label: "Our Boat" },
  { href: "/our-story", label: "Our Story" },
  { href: "/blog", label: "The Bite" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

function documentHasAdminSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  // Match server cookie name (see `ADMIN_SESSION_COOKIE_NAME`) without false-positive `xadmin_session=`.
  return /(?:^|;\s*)admin_session=/.test(document.cookie);
}

export function Header({ adminSessionCookiePresent = false }: { adminSessionCookiePresent?: boolean }) {
  const pathname = usePathname();
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
  // Only mount the modal after it has been opened at least once — avoids mounting a
  // 2300-line component on every page load even when the modal is never opened.
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
    if (!accountOpen) return;
    const close = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [accountOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-brand-primary backdrop-blur-md",
        "bg-brand-primary",
        "pt-[env(safe-area-inset-top)]"
      )}
    >
      {/* Thin orange bar – social icons (placeholders until real profile URLs are set) */}
      <div className="bg-brand-secondary flex items-center justify-center px-3 sm:px-4 lg:px-8 h-8 min-h-8">
        <div className="flex items-center gap-1 sm:gap-2">
          {(
            [
              {
                key: "instagram",
                href: brand.socials.instagram,
                label: "Instagram",
                icon: (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                ),
              },
              {
                key: "facebook",
                href: brand.socials.facebook,
                label: "Facebook",
                icon: (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                ),
              },
              {
                key: "tiktok",
                href: brand.socials.tiktok,
                label: "TikTok",
                icon: (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88 2.1V9.4a6.84 6.84 0 0 0-1.05-.08A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                  </svg>
                ),
              },
              {
                key: "yelp",
                href: brand.socials.yelp,
                label: "Yelp",
                icon: (
                  <Image
                    src="/photos/yelp.png"
                    alt=""
                    width={16}
                    height={16}
                    className="w-4 h-4 object-contain brightness-0 invert"
                    aria-hidden
                  />
                ),
              },
              {
                key: "tripadvisor",
                href: brand.socials.tripadvisor,
                label: "TripAdvisor",
                icon: (
                  <Image
                    src="/photos/tripadvisor.png"
                    alt=""
                    width={24}
                    height={24}
                    className="w-6 h-6 object-contain brightness-0 invert"
                    aria-hidden
                  />
                ),
              },
            ] as const
          ).map((s) => {
            const href = (s.href ?? "").trim();
            const isPlaceholder = !href;
            const className =
              "flex items-center justify-center w-8 h-8 rounded text-white/90 hover:text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-secondary";
            if (isPlaceholder) {
              return (
                <span
                  key={s.key}
                  className={cn(className, "cursor-default opacity-90")}
                  aria-label={`${s.label} (coming soon)`}
                  title={`${s.label} — coming soon`}
                >
                  {s.icon}
                </span>
              );
            }
            return (
              <a
                key={s.key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                aria-label={s.label}
              >
                {s.icon}
              </a>
            );
          })}
        </div>
      </div>
      {/* Single row on mobile (flex-nowrap); overflow-visible so account dropdown isn't clipped */}
      <div
        className={cn(
          "container-wide relative flex items-center justify-between",
          "h-16 sm:h-[4.5rem] lg:h-20",
          "flex-nowrap overflow-visible",
          "gap-2 px-3 sm:px-4 lg:px-8"
        )}
      >
        {/* Left: logo */}
        <div className="flex shrink-0 items-center min-w-0 max-w-[50%] sm:max-w-[45%] lg:max-w-none">
          <Link
            href="/"
            className="flex items-center min-w-0 rounded-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary"
            aria-label="Nasty Sport Fishing home"
          >
            <Image
              src={brand.logoNavbarPath ?? brand.logoMonogramPath ?? brand.logoPath}
              alt={brand.logoAlt}
              width={250}
              height={125}
              className="h-11 w-auto max-w-[180px] sm:h-12 sm:max-w-[210px] lg:h-14 lg:max-w-[250px] object-contain object-left"
              sizes="(max-width: 640px) 180px, (max-width: 1023px) 210px, 250px"
              priority
              fetchPriority="high"
            />
          </Link>
        </div>

        {/* Desktop: nav links – centered; active page styled to stand out */}
        <nav className="hidden lg:flex items-center justify-center gap-1 shrink-0 absolute left-1/2 -translate-x-1/2" aria-label="Main">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href + "/")) ||
              (link.href.startsWith("/boats/") && pathname.startsWith("/boats/"));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 px-3 py-3 rounded-lg text-base font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "text-white bg-white/20 font-semibold"
                    : "text-white/90 hover:text-white hover:bg-white/10"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: icons + CTA – compact on mobile, no wrap */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 lg:gap-2 min-w-0">
          {phone ? (
            <a
              href={`tel:${phone.tel}`}
              onClick={handleCallClick}
              className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 lg:w-12 lg:h-12 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary touch-manipulation"
              aria-label={`Call ${phone.display}`}
            >
              <Phone className="h-6 w-6 lg:h-6 lg:w-6" aria-hidden />
            </a>
          ) : null}
          {/* Account icon – only when admin is signed in; never shown to regular users */}
          {isAdmin && (
            <div className="relative shrink-0" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 lg:w-12 lg:h-12 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary touch-manipulation"
                aria-label="Account menu"
                aria-haspopup="true"
              >
                <User className="h-6 w-6 lg:h-6 lg:w-6" aria-hidden />
                <ChevronDown className={cn("hidden lg:block ml-0.5 h-4 w-4 opacity-80 transition-transform", accountOpen && "rotate-180")} aria-hidden />
              </button>
              {accountOpen && (
                <div
                  className="absolute right-0 top-full mt-1 min-w-[180px] rounded-xl border border-white/20 bg-brand-primary shadow-lg py-1 z-[100]"
                  aria-label="Account menu"
                >
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-white/90 hover:bg-white/15 hover:text-white transition-colors touch-manipulation"
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
            variant="secondary"
            size="lg"
            className={cn(
              "hidden sm:inline-flex shrink-0 rounded-xl shadow-[0_2px_12px_rgba(255,107,26,0.3)] touch-manipulation",
              "h-11 min-w-[4rem] px-3 text-sm font-semibold sm:h-12 sm:min-w-[5rem] sm:px-4 lg:h-12 lg:min-w-[7rem] lg:px-5 lg:text-base"
            )}
            onClick={() => setBookingModalOpen(true)}
          >
            Book now
          </Button>
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
        </div>
      </div>
    </header>
  );
}
