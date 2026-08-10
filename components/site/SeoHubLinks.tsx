import Link from "next/link";

const HOMEPAGE_SEO_LINKS: { href: string; label: string }[] = [
  { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas fishing charters" },
  { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing Cabo" },
  { href: "/cabo-fishing-charter-prices", label: "Charter prices" },
  { href: "/cabo-marlin-fishing", label: "Marlin fishing Cabo" },
  { href: "/cabo-fishing-calendar", label: "Cabo fishing calendar" },
  { href: "/fishing-reports", label: "Fishing reports" },
  { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
  { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
];

const EXPERIENCES_HUB_SEO_LINKS: { href: string; label: string }[] = [
  ...HOMEPAGE_SEO_LINKS,
  { href: "/los-cabos-fishing-charters", label: "Los Cabos fishing charters" },
  { href: "/best-time-to-fish-cabo", label: "Best time to fish Cabo" },
  { href: "/best-fishing-charters-cabo-san-lucas", label: "How to choose a charter" },
  { href: "/packages", label: "Multi-day packages" },
  { href: "/boats", label: "Our fishing boat" },
  { href: "/faqs", label: "Charter FAQs" },
  { href: "/contact", label: "Contact" },
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
      aria-label="Cabo fishing guides and charters"
    >
      <div className={variant === "home" ? "max-w-7xl mx-auto" : undefined}>
        <h2 className="text-lg sm:text-xl font-semibold text-brand-dark text-center mb-4">
          Cabo fishing guides &amp; charters
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
