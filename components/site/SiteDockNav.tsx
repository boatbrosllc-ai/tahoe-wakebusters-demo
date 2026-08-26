"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  HelpCircle,
  Home,
  Mail,
  Ship,
  Users,
} from "lucide-react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type DockNavItem = {
  title: string;
  href?: string;
  icon: ReactNode;
  onClick?: () => void;
  accent?: boolean;
  active?: boolean;
};

function DockNavHit({
  item,
  children,
}: {
  item: DockNavItem;
  children: ReactNode;
}) {
  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        className="appearance-none border-0 bg-transparent p-0"
        aria-label={item.title}
      >
        {children}
      </button>
    );
  }

  return (
    <Link
      href={item.href || "/"}
      aria-label={item.title}
      aria-current={item.active ? "page" : undefined}
      className="block"
    >
      {children}
    </Link>
  );
}

/**
 * Floating dock — mobile only (replaces MobileStickyBar).
 * Desktop uses the full top navbar.
 */
export function SiteDockNav() {
  const pathname = usePathname();
  const { setOpen } = useBookingModal();
  const onHome = pathname === "/";
  const onContact = pathname === "/contact" || pathname?.startsWith("/contact/");
  const onFaqs = pathname === "/faqs" || pathname?.startsWith("/faqs/");
  const onExperiences =
    pathname === "/experiences" ||
    pathname?.startsWith("/experiences/") ||
    pathname === "/boats" ||
    pathname?.startsWith("/boats/");

  const items: DockNavItem[] = [
    {
      title: "Home",
      href: "/",
      icon: <Home className="h-full w-full" />,
      active: onHome,
    },
    {
      title: onHome ? "Fleet" : "Experiences",
      href: onHome ? "/#fleet" : "/experiences",
      icon: <Ship className="h-full w-full" />,
      active: !onHome && onExperiences,
    },
    {
      title: "Book",
      icon: <CalendarCheck className="h-full w-full" />,
      onClick: () => {
        analytics.bookCtaClick("dock-nav", pathname === "/" ? "home" : pathname || "site");
        setOpen(true);
      },
      accent: true,
    },
    {
      title: onHome ? "Story" : "FAQs",
      href: onHome ? "/#about" : "/faqs",
      icon: onHome ? <Users className="h-full w-full" /> : <HelpCircle className="h-full w-full" />,
      active: !onHome && onFaqs,
    },
    {
      title: "Contact",
      href: "/contact",
      icon: <Mail className="h-full w-full" />,
      active: onContact,
    },
  ];

  return (
    <div
      className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(100%-0.75rem,28rem)] -translate-x-1/2 overflow-visible lg:hidden"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="pointer-events-auto overflow-visible">
        <Dock
          baseItemSize={60}
          magnification={96}
          distance={150}
          panelHeight={96}
          className="items-end gap-4 border border-white/55 bg-white/70 px-4 pb-3.5 shadow-[0_12px_40px_-10px_rgba(10,22,40,0.35),0_0_0_1px_rgba(10,22,40,0.06)] backdrop-blur-xl"
        >
          {items.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            return (
              <DockNavHit key={item.title} item={item}>
                <DockItem
                  className={cn(
                    "aspect-square rounded-full",
                    item.accent
                      ? "bg-brand-secondary text-white shadow-lg shadow-brand-secondary/40"
                      : item.active
                        ? "bg-brand-dark/10 text-brand-dark ring-1 ring-brand-dark/20"
                        : "bg-brand-dark/[0.06] text-brand-dark/80 ring-1 ring-brand-dark/10"
                  )}
                >
                  <DockLabel
                    className={cn(
                      "border-brand-dark/10 bg-brand-dark text-white shadow-soft",
                      isFirst && "left-0 translate-x-0",
                      isLast && "left-auto right-0 translate-x-0"
                    )}
                  >
                    {item.title}
                  </DockLabel>
                  <DockIcon className={item.accent ? "text-white" : "text-brand-dark"}>
                    {item.icon}
                  </DockIcon>
                </DockItem>
              </DockNavHit>
            );
          })}
        </Dock>
      </div>
    </div>
  );
}
