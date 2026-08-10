import type { Metadata } from "next";
import Link from "next/link";
import {
  Home,
  Compass,
  Ship,
  CalendarCheck,
  BookOpen,
  Newspaper,
  HelpCircle,
  Mail,
  ChevronRight,
} from "lucide-react";
import { brand } from "@/content/brand";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CallCard } from "@/components/site/CallCard";
import { getPublicPhone } from "@/lib/seo/public-contact";
import { OUR_BOAT_PATH } from "@/content/launch-boat";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com";

export const metadata: Metadata = {
  title: "Menu | Cabo Sport Fishing",
  description:
    "Nasty Sport Fishing — Cabo San Lucas sport fishing charters. Book, charters, FAQs, contact.",
  keywords: ["Cabo fishing charters", "Nasty Sport Fishing", "Cabo San Lucas sport fishing"],
  alternates: { canonical: `${baseUrl}/menu` },
  openGraph: {
    title: "Menu | Cabo Sport Fishing | Nasty Sport Fishing",
    description: "Browse charters, book, story, FAQs, contact. Cabo San Lucas sport fishing.",
    url: `${baseUrl}/menu`,
  },
};

const pageLinks = [
  { href: "/", label: "Home", icon: Home, description: "Back to homepage and hero" },
  {
    href: "/experiences",
    label: "Charters",
    icon: Compass,
    description: "Half-day, full-day & sunset fishing trips",
  },
  {
    href: OUR_BOAT_PATH,
    label: "Our Boat",
    icon: Ship,
    description: "Meet the boat for your Cabo charter",
  },
  {
    href: "/booking",
    label: "Book Now",
    icon: CalendarCheck,
    description: "Book now and reserve your charter",
  },
  {
    href: "/our-story",
    label: "Our Story",
    icon: BookOpen,
    description: "Meet the crew behind Nasty Sport Fishing and our story",
  },
  {
    href: "/blog",
    label: "The Bite",
    icon: Newspaper,
    description: "Cabo fishing tips, seasons, and trip news",
  },
  {
    href: "/faqs",
    label: "FAQs",
    icon: HelpCircle,
    description: "Common questions about rentals, booking, and what to expect",
  },
  {
    href: "/contact",
    label: "Contact",
    icon: Mail,
    description: "Phone, email, and get in touch with us",
  },
];

export default function MenuPage() {
  return (
    <div className="section-padding bg-brand-bg min-h-screen pt-12 sm:pt-16 pb-28 sm:pb-16 lg:pb-24">
      <div className="container-narrow px-5 sm:px-6 lg:px-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-3 sm:mb-1">
          Menu
        </h1>
        <p className="text-brand-muted mb-12 sm:mb-8">
          Explore {brand.companyName} – book a boat, read our story, or get in touch.
        </p>

        <nav className="flex flex-col gap-2 sm:gap-3" aria-label="Site navigation">
          {pageLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="block">
                <Card className="transition-shadow hover:shadow-soft-lg border-brand-dark/10 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-5 py-7 px-6 sm:gap-4 sm:py-4 sm:px-5 sm:p-5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                        <Icon className="h-6 w-6" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-brand-dark block">
                          {item.label}
                        </span>
                        <span className="text-sm text-brand-muted block line-clamp-2">
                          {item.description}
                        </span>
                      </div>
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-brand-muted"
                        aria-hidden
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </nav>

        <div className="mt-14 sm:mt-8 space-y-8 sm:space-y-3">
          {(() => {
            const phone = getPublicPhone();
            return phone ? <CallCard phone={phone.display} phoneTel={phone.tel} /> : null;
          })()}

          <Link href="/experiences" className="block">
            <Button
              variant="secondary"
              size="lg"
              className="w-full rounded-xl h-14 text-base font-semibold"
            >
              <CalendarCheck className="h-5 w-5 mr-2" aria-hidden />
              Book now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
