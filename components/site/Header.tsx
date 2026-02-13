"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Phone, User, LayoutDashboard, ChevronDown } from "lucide-react";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { CalendarModal } from "@/components/site/CalendarModal";
import { BookingModal } from "@/components/site/BookingModal";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/experiences", label: "Experiences" },
  { href: "/faqs", label: "FAQs" },
  { href: "/our-story", label: "Our Story" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const { open: bookingModalOpen, setOpen: setBookingModalOpen, initialSelection } = useBookingModal();

  const handleCallClick = () => analytics.callClick("header", "global");

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data: { signedIn?: boolean }) => setIsAdmin(data.signedIn === true))
      .catch(() => setIsAdmin(false));
  }, []);

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
          <button
            type="button"
            onClick={() => setBookingModalOpen(true)}
            className="shrink-0 px-3 py-3 rounded-lg text-base font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            Book
          </button>
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
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 lg:w-12 lg:h-12 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary touch-manipulation"
            aria-label="Open calendar"
          >
            <Calendar className="h-6 w-6 lg:h-6 lg:w-6" aria-hidden />
          </button>
          <CalendarModal open={calendarOpen} onOpenChange={setCalendarOpen} />
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
              "shrink-0 rounded-xl shadow-[0_2px_12px_rgba(254,63,147,0.3)] touch-manipulation",
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
