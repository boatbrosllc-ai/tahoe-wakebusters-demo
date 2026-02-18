"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TermsAcceptProps {
  termsHtml: string;
  onAcceptChange: (accepted: boolean) => void;
  requiredScrollToBottom?: boolean;
  className?: string;
}

export function TermsAccept({
  termsHtml,
  onAcceptChange,
  requiredScrollToBottom = true,
  className,
}: TermsAcceptProps) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 20;
    setScrolledToBottom(atBottom);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    handleScroll();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [termsHtml]);

  const canAccept = requiredScrollToBottom ? scrolledToBottom : true;
  const accepted = checked && canAccept;
  useEffect(() => {
    onAcceptChange(accepted);
  }, [accepted, onAcceptChange]);

  return (
    <div className={cn("space-y-4", className)}>
      <div
        ref={scrollRef}
        className="max-h-[50vh] sm:max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-brand-dark/20 bg-brand-bg/30 p-4 text-sm text-brand-dark prose prose-sm max-w-none overscroll-contain touch-pan-y"
        dangerouslySetInnerHTML={{ __html: termsHtml }}
      />
      {requiredScrollToBottom && !scrolledToBottom && (
        <p className="text-sm text-amber-700" role="status">
          Scroll to the bottom of the terms to continue.
        </p>
      )}
      <label className="flex items-start gap-3 cursor-pointer min-h-[48px] touch-manipulation">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={!canAccept}
          className="mt-1.5 h-5 w-5 shrink-0 rounded border-brand-dark/30 text-brand-primary focus:ring-2 focus:ring-brand-primary"
          aria-describedby={requiredScrollToBottom && !scrolledToBottom ? undefined : "terms-agree-desc"}
        />
        <span id="terms-agree-desc" className="text-sm text-brand-dark pt-0.5">
          I have read and agree to the terms and conditions above.
        </span>
      </label>
    </div>
  );
}
