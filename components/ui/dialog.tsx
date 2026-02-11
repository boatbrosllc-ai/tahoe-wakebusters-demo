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
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden min-h-screen pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
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
      {/* Panel – centered on mobile and desktop, max height so inner content scrolls */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg max-h-[85dvh] sm:max-h-[85vh] flex flex-col min-h-0 rounded-2xl bg-white shadow-premium my-auto",
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
