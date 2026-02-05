"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Phone } from "lucide-react";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { CalendarModal } from "@/components/site/CalendarModal";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/experiences", label: "Experiences" },
  { href: "/book", label: "Book" },
  { href: "/faqs", label: "FAQs" },
  { href: "/our-story", label: "Our Story" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const handleCallClick = () => analytics.callClick("header", "global");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-brand-primary backdrop-blur-md",
        "bg-brand-primary"
      )}
    >
      <div className="container-wide flex h-[4.5rem] lg:h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: logo (flex-1 so middle nav is centered; logo stays left) */}
        <div className="flex flex-1 items-center justify-start min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 rounded-xl overflow-hidden transition-transform duration-200 hover:scale-105 active:scale-[0.98]"
            aria-label="Boat Bros ATX home"
          >
            <Image
              src={brand.logoNavbarPath ?? brand.logoMonogramPath ?? brand.logoPath}
              alt={brand.logoAlt}
              width={56}
              height={56}
              className="h-14 w-14 lg:h-12 lg:w-12 object-contain rounded-xl"
              priority
            />
          </Link>
        </div>

        {/* Desktop: nav links centered in the bar */}
        <nav className="hidden lg:flex items-center justify-center gap-1 shrink-0" aria-label="Main">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right: phone icon + calendar + CTAs – always right-aligned */}
        <div className="flex flex-1 justify-end items-center gap-2 sm:gap-3 min-w-0">
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className="flex items-center justify-center p-3.5 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary lg:p-2.5"
            aria-label={`Call ${siteConfig.phone}`}
          >
            <Phone className="h-7 w-7 lg:h-6 lg:w-6 shrink-0" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="flex items-center justify-center p-3.5 rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary lg:p-2.5"
            aria-label="Open calendar"
          >
            <Calendar className="h-7 w-7 lg:h-6 lg:w-6" aria-hidden />
          </button>
          <CalendarModal open={calendarOpen} onOpenChange={setCalendarOpen} />
          <Button asChild variant="secondary" size="default" className="hidden lg:inline-flex rounded-xl ml-1 shadow-[0_2px_12px_rgba(254,63,147,0.3)]">
            <Link href="/book">Check Availability</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
