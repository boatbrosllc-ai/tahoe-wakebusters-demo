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
      className={cn(
        "fixed inset-0 z-[100] flex overflow-hidden min-h-screen overscroll-contain",
        fullScreenOnMobile
          ? "items-end sm:items-center sm:justify-center sm:p-4 sm:pt-[env(safe-area-inset-top)] sm:pb-[env(safe-area-inset-bottom)]"
          : "items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      )}
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
      {/* Panel */}
      <div
        className={cn(
          "relative z-10 flex flex-col min-h-0 overflow-hidden bg-white shadow-premium",
          fullScreenOnMobile
            ? "w-full max-h-[90dvh] rounded-t-2xl rounded-b-none sm:rounded-2xl sm:max-w-lg sm:max-h-[85vh]"
            : "w-full max-w-lg max-h-[85dvh] sm:max-h-[85vh] rounded-2xl my-auto",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
        tabIndex={-1}
      >
        <DialogCloseButton onClose={close} />
        {(title || description) && (
          <div className="border-b border-brand-dark/10 px-4 sm:px-6 py-3 sm:py-4 pr-12 shrink-0">
            {title && <h2 id={titleId} className="text-lg font-semibold text-brand-dark">{title}</h2>}
            {description && <p id={descId} className="mt-0.5 text-sm text-brand-muted">{description}</p>}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 sm:px-6 py-4 sm:py-5 overflow-x-hidden">
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
        "absolute right-4 top-4 rounded-lg p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
        className
      )}
      aria-label="Close"
    >
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}
