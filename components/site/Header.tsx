"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Phone, User, LayoutDashboard, ChevronDown } from "lucide-react";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { BookingModal } from "@/components/site/BookingModal";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/experiences", label: "Experiences" },
  { href: "/our-story", label: "Our Story" },
  { href: "/blog", label: "The Dock" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const { open: bookingModalOpen, setOpen: setBookingModalOpen, initialSelection } = useBookingModal();

  const handleCallClick = () => analytics.callClick("header", "global");

  // Re-check admin session on mount and when pathname changes (e.g. after signing in and navigating to site)
  useEffect(() => {
    fetch("/api/admin/session", { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data: { signedIn?: boolean }) => setIsAdmin(data.signedIn === true))
      .catch(() => setIsAdmin(false));
  }, [pathname]);

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
        "sticky top-0 z-40 w-full border-b border-brand-primary/80 backdrop-blur-md",
        "bg-brand-primary",
        "pt-[env(safe-area-inset-top)]"
      )}
    >
      {/* Thin pink bar – social icons */}
      <div className="bg-brand-secondary flex items-center justify-center px-3 sm:px-4 lg:px-8 h-8 min-h-8">
        <div className="flex items-center gap-1 sm:gap-2">
          {brand.socials.instagram && (
            <a
              href={brand.socials.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded text-white/90 hover:text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-secondary"
              aria-label="Instagram"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
          )}
          {brand.socials.facebook && (
            <a
              href={brand.socials.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded text-white/90 hover:text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-secondary"
              aria-label="Facebook"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          )}
          {brand.socials.tiktok && (
            <a
              href={brand.socials.tiktok}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded text-white/90 hover:text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-secondary"
              aria-label="TikTok"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88 2.1V9.4a6.84 6.84 0 0 0-1.05-.08A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
              </svg>
            </a>
          )}
          {brand.socials.yelp && (
            <a
              href={brand.socials.yelp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded text-white/90 hover:text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-secondary"
              aria-label="Yelp"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.16 12.73l-4.27 1.62.96 2.53a2.24 2.24 0 0 1-1.14 2.94 2.24 2.24 0 0 1-2.94-1.14l-.97-2.54-2.74.46a.56.56 0 0 1-.6-.36.56.56 0 0 1 .35-.7l2.75-.46-.46-2.74a.56.56 0 0 1 .35-.7.56.56 0 0 1 .7.35l.47 2.75 4.27-1.62-.47-2.74a.56.56 0 0 1 .35-.7.56.56 0 0 1 .7.35l.48 2.8zm-7.5 4.5l.96 2.53a2.24 2.24 0 0 1-1.14 2.94 2.24 2.24 0 0 1-2.94-1.14l-.97-2.54-4.27 1.62.47 2.74a.56.56 0 0 1-.35.7.56.56 0 0 1-.7-.35l-.48-2.8-2.74.46a.56.56 0 0 1-.6-.36.56.56 0 0 1 .35-.7l2.75-.46-.96-2.53a2.24 2.24 0 0 1 1.14-2.94 2.24 2.24 0 0 1 2.94 1.14l.97 2.54 2.74-.46-.47-2.74a.56.56 0 0 1 .35-.7.56.56 0 0 1 .7.35l.48 2.8 4.27-1.62zm-1.5-5.46l.48 2.8 2.74-.46-.96-2.53a2.24 2.24 0 0 1 1.14-2.94 2.24 2.24 0 0 1 2.94 1.14l.97 2.54.97-2.54a2.24 2.24 0 0 1 2.94-1.14 2.24 2.24 0 0 1 1.14 2.94l-.96 2.53 2.74.46a.56.56 0 0 1 .35.7.56.56 0 0 1-.7.35l-2.75-.46-.48 2.8a.56.56 0 0 1-.7.35.56.56 0 0 1-.35-.7l.47-2.74-4.27-1.62-.47 2.74a.56.56 0 0 1-.7.35.56.56 0 0 1-.35-.7l.48-2.8z" />
              </svg>
            </a>
          )}
          {brand.socials.tripadvisor && (
            <a
              href={brand.socials.tripadvisor}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded text-white/90 hover:text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-secondary"
              aria-label="TripAdvisor"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l2.96 2.955a5.997 5.997 0 0 0 4.043 10.43 5.976 5.976 0 0 0 4.075-1.6L12 19.705l1.022-1.02a5.976 5.976 0 0 0 4.075 1.6 5.997 5.997 0 0 0 4.043-10.43L24 6.648h-4.35a13.573 13.573 0 0 0-7.644-2.353zM12 6.255c1.531 0 2.711 1.24 2.711 2.77 0 1.53-1.18 2.77-2.71 2.77-1.531 0-2.712-1.24-2.712-2.77 0-1.53 1.18-2.77 2.71-2.77zm0 10.49c-2.372 0-4.303-1.92-4.303-4.285 0-2.365 1.931-4.285 4.303-4.285 2.372 0 4.303 1.92 4.303 4.285 0 2.365-1.931 4.285-4.303 4.285z" />
              </svg>
            </a>
          )}
        </div>
      </div>
      {/* Single row on mobile (flex-nowrap); overflow-visible so account dropdown isn't clipped */}
      <div
        className={cn(
          "container-wide relative flex items-center justify-between",
          "h-16 sm:h-[4.25rem] lg:h-20",
          "flex-nowrap overflow-visible",
          "gap-2 px-3 sm:px-4 lg:px-8"
        )}
      >
        {/* Left: logo – constrained on mobile so it never bleeds */}
        <div className="flex shrink-0 items-center min-w-0 max-w-[45%] lg:max-w-none">
          <Link
            href="/"
            className="flex items-center min-w-0 rounded-lg overflow-hidden transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary"
            aria-label="Boat Bros ATX home"
          >
            <Image
              src={brand.logoNavbarPath ?? brand.logoMonogramPath ?? brand.logoPath}
              alt={brand.logoAlt}
              width={64}
              height={64}
              className="h-10 w-10 sm:h-11 sm:w-11 lg:h-14 lg:w-14 object-contain object-left"
              priority
              sizes="(max-width: 1023px) 40px, 56px"
            />
          </Link>
        </div>

        {/* Desktop: nav links – centered */}
        <nav className="hidden lg:flex items-center justify-center gap-1 shrink-0 absolute left-1/2 -translate-x-1/2" aria-label="Main">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 px-3 py-3 rounded-lg text-base font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right: icons + CTA – compact on mobile, no wrap */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 lg:gap-2 min-w-0">
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 lg:w-12 lg:h-12 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary touch-manipulation"
            aria-label={`Call ${siteConfig.phone}`}
          >
            <Phone className="h-6 w-6 lg:h-6 lg:w-6" aria-hidden />
          </a>
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
              "hidden sm:inline-flex shrink-0 rounded-xl shadow-[0_2px_12px_rgba(254,63,147,0.3)] touch-manipulation",
              "h-11 min-w-[4rem] px-3 text-sm font-semibold sm:h-12 sm:min-w-[5rem] sm:px-4 lg:h-12 lg:min-w-[7rem] lg:px-5 lg:text-base"
            )}
            onClick={() => setBookingModalOpen(true)}
          >
            Book now
          </Button>
          <BookingModal
            open={bookingModalOpen}
            onOpenChange={setBookingModalOpen}
            initialSelection={initialSelection}
          />
        </div>
      </div>
    </header>
  );
}
