"use client";

import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import { useBookingModal } from "@/components/site/BookingModalContext";
import {
  getMarinaMeetNote,
  getPublicAreaLabel,
  getPublicPhone,
  getVerifiedHours,
} from "@/lib/seo/public-contact";
import { OUR_BOAT_PATH } from "@/content/launch-boat";

const footerLinks = [
  { href: "/experiences", label: "Charters" },
  { href: OUR_BOAT_PATH, label: "Our Boat" },
  { href: "/location", label: "Marina" },
  { href: "/booking", label: "Book" },
  { href: "/our-story", label: "Our Story" },
  { href: "/blog", label: "Blog" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

const seoRentalLinks = [
  { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas fishing charters" },
  { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
  { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
  { href: "/cabo-fishing-charter-prices", label: "Charter prices" },
  { href: "/cabo-marlin-fishing", label: "Marlin fishing Cabo" },
  { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
  { href: "/fishing-reports", label: "Fishing reports" },
  { href: OUR_BOAT_PATH, label: "Our fishing boat" },
];

const linkClass =
  "text-sm text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded";

export function Footer() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  const phone = getPublicPhone();
  const areaLabel = getPublicAreaLabel();
  const marinaNote = getMarinaMeetNote();
  const hours = getVerifiedHours();
  const socialLinks = [
    { href: brand.socials.instagram, label: "Instagram", kind: "instagram" as const },
    { href: brand.socials.facebook, label: "Facebook", kind: "facebook" as const },
    { href: brand.socials.tiktok, label: "TikTok", kind: "tiktok" as const },
    { href: brand.socials.yelp, label: "Yelp", kind: "yelp" as const },
    { href: brand.socials.tripadvisor, label: "TripAdvisor", kind: "tripadvisor" as const },
  ].filter((s) => {
    const u = (s.href ?? "").trim();
    if (!u) return false;
    try {
      const parsed = new URL(u);
      return parsed.pathname !== "/" && parsed.pathname !== "";
    } catch {
      return false;
    }
  });

  return (
    <footer className="bg-brand-dark text-white/90 mt-[-72px] lg:mt-0" role="contentinfo">
      <div className="container-wide px-5 pt-[72px] py-10 pb-24 sm:px-6 sm:py-12 lg:pt-8 lg:px-8 lg:py-16 lg:pb-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="font-semibold text-white text-lg">{brand.companyName}</p>
            <p className="mt-1 text-sm text-white/80">{brand.tagline}</p>
          </div>
          <div>
            <p className="font-medium text-white text-sm mb-2">Quick links</p>
            <ul className="space-y-2">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  {link.href === "/booking" ? (
                    <button
                      type="button"
                      onClick={() => setBookingModalOpen(true)}
                      className={linkClass + " bg-transparent border-0 cursor-pointer text-left p-0"}
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-white text-sm mb-2">Cabo fishing</p>
            <ul className="space-y-2">
              {seoRentalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-white text-sm mb-2">Contact</p>
            {phone ? (
              <p className="text-sm">
                <a
                  href={`tel:${phone.tel}`}
                  className="text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
                >
                  {phone.display}
                </a>
              </p>
            ) : null}
            <p className={`text-sm ${phone ? "mt-1" : ""}`}>
              <a
                href={`mailto:${brand.email}`}
                className="text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
              >
                {brand.email}
              </a>
            </p>
            <p className="text-sm mt-2 text-white/80">{areaLabel}</p>
            <p className="text-sm mt-1 text-white/60">{marinaNote}</p>
            {hours ? <p className="text-sm text-white/60 mt-1">{hours}</p> : null}
          </div>
          <div>
            <p className="font-medium text-white text-sm mb-2">Follow</p>
            {socialLinks.length > 0 ? (
              <div className="flex items-center gap-3">
                {socialLinks.map((s) => (
                  <a
                    key={s.kind}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded text-white/80 hover:text-brand-primary hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                    aria-label={s.label}
                  >
                    {s.kind === "yelp" ? (
                      <Image src="/photos/yelp.png" alt="" width={20} height={20} className="w-5 h-5 object-contain brightness-0 invert" aria-hidden />
                    ) : s.kind === "tripadvisor" ? (
                      <Image src="/photos/tripadvisor.png" alt="" width={20} height={20} className="w-5 h-5 object-contain brightness-0 invert" aria-hidden />
                    ) : s.kind === "instagram" ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    ) : s.kind === "facebook" ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88 2.1V9.4a6.84 6.84 0 0 0-1.05-.08A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                      </svg>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/60">
                <Link href="/contact" className="hover:text-brand-primary transition-colors">
                  Contact us
                </Link>
              </p>
            )}
          </div>
        </div>
        <div className="mt-10 pt-6 sm:mt-12 sm:pt-8 border-t border-white/20 text-sm text-white/60">
          <p>© {new Date().getFullYear()} {brand.companyName}. All rights reserved.</p>
          <p className="mt-1">
            <Link href="/contact" className="hover:text-brand-primary transition-colors">Contact</Link>
            {" · "}
            <Link href="/location" className="hover:text-brand-primary transition-colors">Location</Link>
            {" · "}
            Cabo San Lucas sport fishing. Licensed charters.
          </p>
        </div>
      </div>
    </footer>
  );
}
