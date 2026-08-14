import Link from "next/link";
import { OUR_BOAT_PATH } from "@/content/launch-boat";
import { siteConfig } from "@/config/site";

const HOMEPAGE_SEO_LINKS: { href: string; label: string }[] = [
  { href: "/experiences", label: "Browse trips" },
  { href: "/experiences/nasty-half-day", label: siteConfig.catalog.halfDay.title },
  { href: "/experiences/nasty-full-day", label: siteConfig.catalog.fullDay.title },
  { href: "/packages", label: "Packages" },
  { href: OUR_BOAT_PATH, label: "Our boat" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

const EXPERIENCES_HUB_SEO_LINKS: { href: string; label: string }[] = [
  ...HOMEPAGE_SEO_LINKS,
  { href: "/booking", label: "Book online" },
  { href: "/location", label: "Location" },
];

export function SeoHubLinks({ variant }: { variant: "home" | "experiences" }) {
  const links = variant === "home" ? HOMEPAGE_SEO_LINKS : EXPERIENCES_HUB_SEO_LINKS;
  return (
    <section
      className={
        variant === "home"
          ? "px-5 sm:px-6 lg:px-8 py-10 bg-white border-t border-brand-dark/10"
          : "px-5 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto"
      }
      aria-label="Trip guides and bookings"
    >
      <div className={variant === "home" ? "max-w-7xl mx-auto" : undefined}>
        <h2 className="text-lg sm:text-xl font-semibold text-brand-dark text-center mb-4">
          Plan your trip
        </h2>
        <ul className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-block rounded-full border border-brand-dark/15 px-3 py-1.5 text-sm text-brand-dark/90 hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
