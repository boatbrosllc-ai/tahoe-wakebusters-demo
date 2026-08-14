"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { User, LayoutDashboard } from "lucide-react";
import { brand } from "@/content/brand";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import BookingModal from "@/components/site/BookingModal";
import { cn } from "@/lib/utils";
import { revalidateAdminSession, subscribeAdminAuthRevalidate } from "@/lib/admin-auth-client";

const navLinks = [
  { href: "/experiences", label: "Fleet" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function documentHasAdminSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)admin_session=/.test(document.cookie);
}

/**
 * ABC Boats header — unique nav and chrome. Booking still uses the shared modal.
 */
export function AbcBoatsHeader({ adminSessionCookiePresent = false }: { adminSessionCookiePresent?: boolean }) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(() =>
    adminSessionCookiePresent ? null : false,
  );
  const accountRef = useRef<HTMLDivElement>(null);
  const {
    open: bookingModalOpen,
    setOpen: setBookingModalOpen,
    initialSelection,
    selectionKey,
    openWithSelection,
  } = useBookingModal();
  const [hasOpenedBookingModal, setHasOpenedBookingModal] = useState(false);

  useEffect(() => {
    if (bookingModalOpen) setHasOpenedBookingModal(true);
  }, [bookingModalOpen]);

  const applySessionState = (s: Awaited<ReturnType<typeof revalidateAdminSession>>) => {
    if (s.status === "unavailable") return;
    setIsAdmin(s.status === "signed_in");
  };

  useEffect(() => {
    const hasCookie =
      adminSessionCookiePresent ||
      (typeof document !== "undefined" && documentHasAdminSessionCookie());
    if (!hasCookie) {
      setIsAdmin(false);
      return;
    }
    void revalidateAdminSession().then(applySessionState);
  }, [adminSessionCookiePresent]);

  useEffect(() => {
    const cookiePresent =
      adminSessionCookiePresent ||
      (typeof document !== "undefined" && documentHasAdminSessionCookie());
    if (!cookiePresent && isAdmin !== true) return;
    return subscribeAdminAuthRevalidate(() => {
      void revalidateAdminSession().then(applySessionState);
    });
  }, [adminSessionCookiePresent, isAdmin]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [accountOpen]);

  return (
    <header className="abc-header sticky top-0 z-40 w-full border-b border-[#c9a227]/40 bg-[#0b1f3a] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link href="/" className="flex min-w-0 items-center" aria-label={`${brand.companyName} home`}>
          <Image
            src={brand.logoNavbarPath ?? brand.logoPath}
            alt={brand.logoAlt}
            width={200}
            height={40}
            className="h-8 w-auto max-w-[160px] object-contain object-left sm:h-9 sm:max-w-[200px]"
            priority
            unoptimized
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "font-display text-xs uppercase tracking-[0.2em] transition-colors",
                  isActive ? "text-[#c9a227]" : "text-white/80 hover:text-white"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center text-white/80 hover:text-white"
                aria-label="Account menu"
              >
                <User className="h-5 w-5" aria-hidden />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full z-[100] mt-1 min-w-[180px] border border-[#c9a227]/40 bg-[#0b1f3a] py-1 shadow-lg">
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-white/90 hover:bg-white/10"
                    onClick={() => setAccountOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
                    Dashboard
                  </Link>
                </div>
              )}
            </div>
          )}
          <Button
            type="button"
            size="lg"
            className="h-10 rounded-none bg-[#c9a227] px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#0b1f3a] hover:bg-[#ddb84a] sm:px-5"
            onClick={() => setBookingModalOpen(true)}
          >
            Book
          </Button>
          {(bookingModalOpen || hasOpenedBookingModal) && (
            <BookingModal
              open={bookingModalOpen}
              onOpenChange={setBookingModalOpen}
              initialSelection={initialSelection}
              selectionKey={selectionKey}
              onBookAnother={() => {
                setBookingModalOpen(false);
                queueMicrotask(() => openWithSelection({}));
              }}
            />
          )}
        </div>
      </div>
    </header>
  );
}
