"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  List,
  Ship,
  Calendar,
  BookOpen,
  Users,
  DollarSign,
  Mail,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { brand } from "@/content/brand";
import { cn } from "@/lib/utils";

const navGroups: { label: string; links: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    label: "Overview",
    links: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    links: [
      { href: "/admin/experiences", label: "Listings", icon: List },
      { href: "/admin/boats", label: "Boats", icon: Ship },
    ],
  },
  {
    label: "Business",
    links: [
      { href: "/admin/calendars", label: "Calendar", icon: Calendar },
      { href: "/admin/pricing-calendar", label: "Pricing calendar", icon: DollarSign },
      { href: "/admin/bookings", label: "Bookings", icon: BookOpen },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/financials", label: "Financials", icon: DollarSign },
      { href: "/admin/emails", label: "Email notifications", icon: Mail },
    ],
  },
];

function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ pathname, onLinkClick }: { pathname: string | null; onLinkClick?: () => void }) {
  return (
    <>
      {navGroups.map((group) => (
        <div key={group.label} className="mb-6 last:mb-0">
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = isActive(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onLinkClick}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-sm font-medium transition-all min-h-[44px] flex items-center gap-3",
                    active
                      ? "bg-brand-primary/20 text-brand-primary shadow-sm ring-1 ring-brand-primary/30"
                      : "text-white/85 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", active ? "text-brand-primary" : "text-white/70")} aria-hidden />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-brand-bg/50">
      {/* Mobile: floating menu button */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-dark text-brand-primary shadow-lg ring-2 ring-brand-primary/40 hover:bg-brand-primary hover:text-white hover:ring-brand-primary sm:hidden transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" aria-hidden />
      </button>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity sm:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setSidebarOpen(false)}
        role="presentation"
        aria-hidden
      />
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-brand-dark shadow-2xl transition-transform duration-200 ease-out sm:static sm:z-0 sm:h-auto sm:w-60 sm:shrink-0 sm:translate-x-0 sm:shadow-none md:w-64",
          "border-r border-white/10",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <Link
            href="/"
            className="flex items-center gap-3 min-w-0 rounded-xl overflow-hidden p-1 -m-1 hover:bg-white/5 transition-colors"
            aria-label={`${brand.logoAlt} home`}
          >
            <Image
              src={brand.logoNavbarPath ?? brand.logoPath}
              alt={brand.logoAlt}
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain rounded-xl"
            />
            <span className="text-xs font-medium text-brand-primary truncate">Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white sm:hidden transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
          <NavLinks pathname={pathname} onLinkClick={() => setSidebarOpen(false)} />
        </nav>
        <div className="mt-auto border-t border-white/10 p-4 shrink-0">
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white text-left min-h-[44px] flex items-center gap-3 transition-colors"
            >
              <LogOut className="h-5 w-5 shrink-0 text-white/60" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content: full width on Calendars for a big readable calendar, constrained on other pages */}
      <main className="min-w-0 flex-1 overflow-auto py-6 px-4 sm:py-8 sm:px-6 lg:px-8">
        <div className={cn("mx-auto w-full", pathname === "/admin" ? "max-w-6xl" : (pathname?.includes("/admin/calendars") || pathname?.includes("/admin/pricing-calendar") || pathname?.includes("/admin/emails")) ? "max-w-none" : "max-w-4xl")}>
          {children}
        </div>
      </main>
    </div>
  );
}
