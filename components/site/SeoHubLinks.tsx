import Link from "next/link";

const HOMEPAGE_SEO_LINKS: { href: string; label: string }[] = [
  { href: "/boat-rental-austin", label: "Boat rental Austin" },
  { href: "/lake-austin-boat-rentals", label: "Lake Austin boat rentals" },
  { href: "/austin-party-boat-rentals", label: "Austin party boat rentals" },
  { href: "/pontoon-boat-rental-austin", label: "Pontoon boat rental Austin" },
  { href: "/wakesurf-club-austin", label: "Wakesurf Club Austin" },
  { href: "/sunset-cruise-austin", label: "Sunset cruise Austin" },
];

const EXPERIENCES_HUB_SEO_LINKS: { href: string; label: string }[] = [
  ...HOMEPAGE_SEO_LINKS,
  { href: "/lake-austin-party-boat-rentals", label: "Lake Austin party boat rentals" },
  { href: "/private-boat-rental-austin", label: "Private boat rental Austin" },
  { href: "/captained-boat-rental-austin", label: "Captained boat rental Austin" },
  { href: "/boat-ride-austin", label: "Boat ride Austin" },
  { href: "/wakesurfing-austin", label: "Wakesurfing Austin" },
  { href: "/wake-boat-rental-austin", label: "Wake boat rental Austin" },
  { href: "/lake-austin-sunset-cruise", label: "Lake Austin sunset cruise" },
  { href: "/lake-austin-vs-lake-travis-boat-rental", label: "Lake Austin vs Lake Travis" },
  { href: "/austin-bachelorette-boat-rental", label: "Bachelorette party boat" },
  { href: "/austin-bachelor-party-boat-rental", label: "Bachelor party boat" },
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
      aria-label="Popular boat rentals in Austin"
    >
      <div className={variant === "home" ? "max-w-7xl mx-auto" : undefined}>
        <h2 className="text-lg sm:text-xl font-semibold text-brand-dark text-center mb-4">
          Popular boat rentals in Austin
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
