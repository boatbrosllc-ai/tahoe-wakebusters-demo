"use client";

import Link from "next/link";
import { brand } from "@/content/brand";
import { useBookingModal } from "@/components/site/BookingModalContext";

const footerLinks = [
  { href: "/experiences", label: "Experiences" },
  { href: "/booking", label: "Book" },
  { href: "/faqs", label: "FAQs" },
  { href: "/our-story", label: "Our Story" },
  { href: "/contact", label: "Contact" },
  { href: "/blog", label: "The Dock" },
];

const linkClass =
  "text-sm text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded";

export function Footer() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  const address = `${brand.address.line1}, ${brand.address.city}, ${brand.address.state} ${brand.address.zip}`;

  return (
    <footer className="bg-brand-dark text-white/90 mt-[-72px] lg:mt-0" role="contentinfo">
      <div className="container-wide px-5 pt-[72px] py-10 pb-24 sm:px-6 sm:py-12 lg:pt-8 lg:px-8 lg:py-16 lg:pb-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="font-medium text-white text-sm mb-2">Contact</p>
            <p className="text-sm">
              <a
                href={`tel:${brand.phoneTel}`}
                className="text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
              >
                {brand.phone}
              </a>
            </p>
            <p className="text-sm mt-1">
              <a
                href={`mailto:${brand.email}`}
                className="text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
              >
                {brand.email}
              </a>
            </p>
            <p className="text-sm mt-2 text-white/80">{address}</p>
            <p className="text-sm text-white/60">{brand.hours}</p>
          </div>
          <div>
            <p className="font-medium text-white text-sm mb-2">Follow</p>
            <div className="flex gap-4">
              {brand.socials.instagram && (
                <a
                  href={brand.socials.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
                  aria-label="Instagram"
                >
                  Instagram
                </a>
              )}
              {brand.socials.facebook && (
                <a
                  href={brand.socials.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white/80 hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
                  aria-label="Facebook"
                >
                  Facebook
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mt-10 pt-6 sm:mt-12 sm:pt-8 border-t border-white/20 text-sm text-white/60">
          <p>© {new Date().getFullYear()} {brand.companyName}. All rights reserved.</p>
          <p className="mt-1">
            <Link href="/contact" className="hover:text-brand-primary transition-colors">Contact</Link>
            {" · "}
            Lake Austin boat rentals, Austin TX. Licensed & insured.
          </p>
        </div>
      </div>
    </footer>
  );
}
