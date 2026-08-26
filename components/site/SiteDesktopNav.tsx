"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Anchor, Ship, Sparkles, Star, Users, Waves } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavGridCard,
  NavSmallItem,
  type NavItemType,
} from "@/components/ui/navigation-menu";
import { experiences } from "@/content/experiences";
import { OUR_BOAT_PATH } from "@/content/launch-boat";
import { hasFeature } from "@/lib/plan";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/** Short blurbs for mega-menu — keep copy tight under photos. */
const FLEET_BLURBS: Record<string, string> = {
  pontoon: "Slides · grill · whole crew",
  watersports: "Mastercraft · boards included",
  sunset: "Emerald Bay · easy cruising",
};

function fleetLinks(): NavItemType[] {
  return experiences.map((boat) => ({
    title: boat.title,
    href: `/experiences/${boat.slug}`,
    description: FLEET_BLURBS[boat.slug] ?? boat.capacity,
    image: boat.heroImage,
    imageAlt: boat.imageAlt || boat.title,
  }));
}

function companyLinks(): NavItemType[] {
  const links: NavItemType[] = [
    {
      title: "Our Story",
      href: "/our-story",
      description: "Brothers · locals · lake obsessed",
      icon: Users,
    },
    {
      title: "Why Wakebusters",
      href: "/#why-us",
      description: "Gas · toys · captains included",
      icon: Sparkles,
    },
    {
      title: "Reviews",
      href: "/#reviews",
      description: "5-star Lake Tahoe days",
      icon: Star,
    },
  ];
  if (hasFeature("blogStudio")) {
    links.push({
      title: siteConfig.nav.blogLabel || "Blog",
      href: "/blog",
      description: "Lake life tips and updates",
      icon: Waves,
    });
  }
  return links;
}

/**
 * Desktop mega-menu — panels span the full header bar width.
 * Controlled so fixed-position panels always dismiss cleanly.
 */
export function SiteDesktopNav({ className }: { className?: string }) {
  const fleet = fleetLinks();
  const company = companyLinks();
  const [menuValue, setMenuValue] = useState("");

  useEffect(() => {
    if (!menuValue) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;
      const onTrigger = Boolean(target.closest('[data-slot="navigation-menu-trigger"]'));
      const onOpenPanel = Boolean(
        target.closest('[data-slot="navigation-menu-content"][data-state="open"]')
      );
      // Let Radix toggle when the trigger is clicked; close everywhere else
      if (!onTrigger && !onOpenPanel) setMenuValue("");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuValue("");
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuValue]);

  return (
    <NavigationMenu
      viewport={false}
      value={menuValue}
      onValueChange={setMenuValue}
      delayDuration={0}
      className={cn("justify-center", className)}
    >
      <NavigationMenuList className="gap-1.5 xl:gap-3">
        <NavigationMenuItem value="fleet">
          <NavigationMenuTrigger className="px-3 py-2.5 text-base xl:px-5 xl:py-3.5 xl:text-lg">Fleet</NavigationMenuTrigger>
          {menuValue === "fleet" ? (
            <NavigationMenuContent>
              <div className="grid gap-0 lg:grid-cols-[1fr_14rem]">
                <ul className="grid grow gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
                  {fleet.map((link) => (
                    <li key={link.href}>
                      <NavGridCard link={link} className="min-h-[12.5rem] sm:min-h-[14rem]" />
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-col justify-center gap-1 border-t border-brand-dark/10 bg-brand-bg/60 p-4 sm:p-5 lg:border-l lg:border-t-0">
                  <li>
                    <NavSmallItem
                      item={{
                        title: "All experiences",
                        href: "/experiences",
                        icon: Ship,
                      }}
                      href="/experiences"
                      className="px-3 py-3 text-base"
                    />
                  </li>
                  <li>
                    <NavSmallItem
                      item={{
                        title: siteConfig.nav.boatLabel || "Our boat",
                        href: OUR_BOAT_PATH,
                        icon: Anchor,
                      }}
                      href={OUR_BOAT_PATH}
                      className="px-3 py-3 text-base"
                    />
                  </li>
                  {hasFeature("packages") ? (
                    <li>
                      <NavSmallItem
                        item={{
                          title: siteConfig.nav.packagesLabel || "Packages",
                          href: "/packages",
                          icon: Sparkles,
                        }}
                        href="/packages"
                        className="px-3 py-3 text-base"
                      />
                    </li>
                  ) : null}
                </ul>
              </div>
            </NavigationMenuContent>
          ) : null}
        </NavigationMenuItem>

        <NavigationMenuItem value="company">
          <NavigationMenuTrigger className="px-3 py-2.5 text-base xl:px-5 xl:py-3.5 xl:text-lg">Company</NavigationMenuTrigger>
          {menuValue === "company" ? (
            <NavigationMenuContent>
              <ul
                className={cn(
                  "grid gap-3 p-4 sm:gap-4 sm:p-5",
                  company.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
                )}
              >
                {company.map((link) => (
                  <li key={link.href}>
                    <NavGridCard link={link} className="min-h-[7.5rem]" />
                  </li>
                ))}
              </ul>
            </NavigationMenuContent>
          ) : null}
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              href="/faqs"
              className="inline-flex items-center rounded-lg px-3 py-2.5 text-base font-semibold text-white transition-colors hover:bg-white/20 hover:text-white xl:px-5 xl:py-3.5 xl:text-lg"
            >
              FAQs
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              href="/contact"
              className="inline-flex items-center rounded-lg px-3 py-2.5 text-base font-semibold text-white transition-colors hover:bg-white/20 hover:text-white xl:px-5 xl:py-3.5 xl:text-lg"
            >
              Contact
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
