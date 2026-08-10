"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Compass, CalendarCheck, Menu, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { analytics } from "@/lib/analytics";

type NavLink = { href: string; label: string; icon: LucideIcon; center?: boolean };

const navItems: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/experiences", label: "Experiences", icon: Compass },
  { href: "#", label: "Book now", icon: CalendarCheck, center: true },
  { href: "/menu", label: "Menu", icon: Menu },
  { href: "/contact", label: "Contact", icon: Mail },
];

export function MobileStickyBar() {
  const pathname = usePathname();
  const { setOpen: setBookingModalOpen } = useBookingModal();

  const page = pathname === "/" ? "home" : pathname.replace(/^\//, "");
  const handleBookNowClick = () => {
    analytics.bookCtaClick("mobile_sticky_bar", page);
    setBookingModalOpen(true);
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 lg:hidden",
        "bg-brand-primary border-t border-brand-primary",
        "backdrop-blur-md",
        "pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))]"
      )}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch justify-around min-h-[56px] px-1">
        {navItems.map((linkItem) => {
          const isActive =
            linkItem.href === "/"
              ? pathname === "/"
              : pathname === linkItem.href || pathname.startsWith(linkItem.href + "/");
          const isCenter = linkItem.center === true;

          if (isCenter) {
            return (
              <button
                key="book-now"
                type="button"
                onClick={handleBookNowClick}
                className="flex flex-1 min-w-0 mx-0.5 -mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary rounded-xl"
                aria-label="Book now"
              >
                <motion.span
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 min-h-[52px] rounded-xl w-full",
                    "bg-brand-secondary text-white font-semibold",
                    "shadow-[0_-2px_16px_rgba(242,122,10,0.4)]"
                  )}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <linkItem.icon className="h-6 w-6 shrink-0 mb-0.5" aria-hidden />
                  <span className="text-[10px] leading-tight font-medium truncate w-full text-center px-1">
                    {linkItem.label}
                  </span>
                </motion.span>
              </button>
            );
          }

          return (
            <Link
              key={linkItem.href}
              href={linkItem.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 min-w-0 min-h-[44px] py-2 px-1 rounded-lg",
                "text-white/90 font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset",
                isActive && "text-white"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <motion.span
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg px-2 py-1.5",
                  isActive && "bg-white/15"
                )}
                whileTap={{ scale: 0.95, opacity: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <linkItem.icon className="h-5 w-5 shrink-0 mb-0.5" aria-hidden />
                <span className="text-[10px] leading-tight truncate w-full text-center">
                  {linkItem.label}
                </span>
              </motion.span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
