"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleEscape);
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
      aria-labelledby={title ? "dialog-title" : undefined}
      aria-describedby={description ? "dialog-description" : undefined}
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
      >
        <DialogCloseButton onClose={close} />
        {(title || description) && (
          <div className="border-b border-brand-dark/10 px-4 sm:px-6 py-3 sm:py-4 pr-12 shrink-0">
            {title && (
              <h2 id="dialog-title" className="text-lg font-semibold text-brand-dark">
                {title}
              </h2>
            )}
            {description && (
              <p id="dialog-description" className="mt-0.5 text-sm text-brand-muted">
                {description}
              </p>
            )}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 sm:px-6 py-4 sm:py-5">
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
