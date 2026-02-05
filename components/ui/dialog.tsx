"use client";

import { useEffect, useCallback } from "react";
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "dialog-title" : undefined}
      aria-describedby={description ? "dialog-description" : undefined}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-brand-dark/70 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      {/* Panel */}
      <div
        className={cn(
          "relative w-full max-w-lg rounded-2xl bg-white shadow-premium",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogCloseButton onClose={close} />
        {(title || description) && (
          <div className="border-b border-brand-dark/10 px-6 py-4 pr-12">
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
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
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
