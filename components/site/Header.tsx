"use client";

import { useState, useEffect, useRef } from "react";
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
  const { open: bookingModalOpen, setOpen: setBookingModalOpen, initialSelection } = useBookingModal();
  const [adminSignedIn, setAdminSignedIn] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => setAdminSignedIn(data.signedIn === true))
      .catch(() => setAdminSignedIn(false));
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [accountOpen]);

  const handleCallClick = () => analytics.callClick("header", "global");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-brand-primary backdrop-blur-md",
        "bg-brand-primary"
      )}
    >
      <div className="container-wide relative flex h-[4.5rem] lg:h-20 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 lg:px-8">
        {/* Left: logo – flex-1 so nav (absolute center) stays centered */}
        <div className="flex flex-1 items-center min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 rounded-xl overflow-hidden transition-transform duration-200 hover:scale-105 active:scale-[0.98]"
            aria-label="Boat Bros ATX home"
          >
            <Image
              src={brand.logoNavbarPath ?? brand.logoMonogramPath ?? brand.logoPath}
              alt={brand.logoAlt}
              width={64}
              height={64}
              className="h-14 w-14 lg:h-16 lg:w-16 object-contain rounded-xl"
              priority
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

        {/* Right: icons + account + CTA */}
        <div className="flex flex-1 justify-end items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className="shrink-0 flex items-center justify-center p-3.5 lg:p-3 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary"
            aria-label={`Call ${siteConfig.phone}`}
          >
            <Phone className="h-7 w-7 lg:h-7 lg:w-7" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="shrink-0 flex items-center justify-center p-3.5 lg:p-3 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary"
            aria-label="Open calendar"
          >
            <Calendar className="h-7 w-7 lg:h-7 lg:w-7" aria-hidden />
          </button>
          <CalendarModal open={calendarOpen} onOpenChange={setCalendarOpen} />
          {adminSignedIn && (
            <div className="relative shrink-0" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex items-center gap-1 shrink-0 rounded-xl p-3 text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary"
                aria-haspopup="true"
                aria-label="Account menu"
              >
                <User className="h-6 w-6 shrink-0" aria-hidden />
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", accountOpen && "rotate-180")} aria-hidden />
              </button>
              {accountOpen && (
                <div
                  className="absolute right-0 top-full mt-1 min-w-[180px] rounded-xl border border-white/20 bg-white/95 backdrop-blur-md py-1.5 shadow-lg z-50"
                  aria-label="Account options"
                >
                  <Link
                    href="/admin"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-primary/10 transition-colors rounded-lg mx-1"
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
            className="inline-flex shrink-0 rounded-xl shadow-[0_2px_12px_rgba(254,63,147,0.3)]"
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
