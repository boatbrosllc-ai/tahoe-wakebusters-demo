"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useId, useRef } from "react";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  fullScreenOnMobile?: boolean;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  fullScreenOnMobile,
}: DialogProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const baseId = useId();
  const titleId = title ? `${baseId}-title` : undefined;
  const descId = description ? `${baseId}-desc` : undefined;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(",");
    return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => {
      if (el.hasAttribute("disabled")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      return true;
    });
  };

  useEffect(() => {
    if (!open) return;
    lastActiveElementRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      const focusables = getFocusableElements(panel);
      const initialFocus = focusables[0] ?? panel;
      // Move focus inside immediately for keyboard users.
      initialFocus instanceof HTMLElement && initialFocus.focus?.();
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panelNow = panelRef.current;
      if (!panelNow) return;
      const focusables = getFocusableElements(panelNow);
      if (focusables.length === 0) {
        e.preventDefault();
        panelNow.focus?.();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const activeInside = !!active && panelNow.contains(active);

      if (e.shiftKey) {
        if (!activeInside || active === first) {
          e.preventDefault();
          last.focus?.();
        }
      } else {
        if (!activeInside || active === last) {
          e.preventDefault();
          first.focus?.();
        }
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleFocusTrap);
    const scrollY = window.scrollY;
    const html = document.documentElement;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleFocusTrap);
      // Restore focus when the dialog is dismissed.
      lastActiveElementRef.current?.focus?.();
      html.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, [open, close]);

  if (!open) return null;

  const overlay = (
    <div
      className={
        // h-dvh: avoid min-h-screen/100vh stretching past visible viewport on mobile (iOS toolbar).
        "fixed inset-0 z-[100] flex h-dvh max-h-dvh items-center justify-center overflow-hidden overscroll-contain p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Full-viewport overlay – blurs entire site (navbar + main + footer); portal ensures we're above everything */}
      <div
        className="absolute inset-0 bg-brand-dark/60 backdrop-blur-lg"
        onClick={close}
        aria-hidden
      />
      {/* Panel — max height uses small viewport (stable on iOS); safe area padding is inside body, not double-counted on overlay */}
      <div
        className={cn(
          "relative z-10 flex min-h-0 min-w-0 w-full max-w-[100vw] flex-col overflow-hidden bg-white shadow-premium",
          fullScreenOnMobile
            ? // Mobile: centered card, intentionally shorter than the viewport so backdrop shows around it.
              "mx-auto w-full max-w-full rounded-2xl h-[min(68dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] max-h-[min(68dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] sm:h-auto sm:max-h-[85vh] sm:min-h-0 sm:max-w-lg"
            : "max-h-[85dvh] w-full max-w-lg rounded-2xl sm:max-h-[85vh] my-auto",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
        tabIndex={-1}
      >
        <DialogCloseButton onClose={close} />
        {(title || description) && (
          <div
            className={cn(
              "border-b border-brand-dark/10 px-4 sm:px-6 py-3 sm:py-4 pr-12 shrink-0",
              fullScreenOnMobile && "pt-[max(0.75rem,env(safe-area-inset-top))]"
            )}
          >
            {title && <h2 id={titleId} className="text-lg font-semibold text-brand-dark">{title}</h2>}
            {description && <p id={descId} className="mt-0.5 text-sm text-brand-muted">{description}</p>}
          </div>
        )}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden",
            fullScreenOnMobile ? "overflow-y-auto" : "overflow-y-hidden",
            // Tighter horizontal padding on phones so dense UIs (calendars) fit without horizontal bleed.
            "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-6 sm:pr-6",
            fullScreenOnMobile
              ? title || description
                ? "pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:py-5"
                : "pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(2.75rem,env(safe-area-inset-top))] sm:py-5"
              : "py-4 sm:py-5"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}

type DialogCloseButtonProps = {
  onClose: () => void;
  className?: string;
};

export function DialogCloseButton({ onClose, className }: DialogCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      className={cn(
        "absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl p-0 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 sm:h-10 sm:w-10",
        className
      )}
      aria-label="Close"
    >
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}
