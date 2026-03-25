"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStepIndex: number;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  hideBack?: boolean;
  hideNext?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Stepper({
  steps,
  currentStepIndex,
  onNext,
  onBack,
  nextLabel = "Next",
  backLabel = "Back",
  nextDisabled = false,
  nextLoading = false,
  hideBack = false,
  hideNext = false,
  children,
  className,
}: StepperProps) {
  const isFirst = currentStepIndex <= 0;
  const isLast = currentStepIndex >= steps.length - 1;

  return (
    <div className={cn("flex flex-col min-h-0 min-w-0", className)}>
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 sm:mb-6 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium border-2 transition-colors shrink-0",
                i < currentStepIndex && "bg-brand-primary border-brand-primary text-white",
                i === currentStepIndex && "border-brand-primary text-brand-primary bg-white",
                i > currentStepIndex && "border-brand-dark/20 text-brand-muted bg-white"
              )}
              aria-current={i === currentStepIndex ? "step" : undefined}
            >
              {i < currentStepIndex ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "w-4 sm:w-8 h-0.5 rounded shrink-0 min-w-[12px]",
                  i < currentStepIndex ? "bg-brand-primary" : "bg-brand-dark/20"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="text-center text-xs sm:text-sm text-brand-muted mb-4 px-1 leading-snug" aria-live="polite">
        Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex]?.label}
      </p>

      {/* Extra bottom space on small screens so the last field can scroll above the sticky CTA bar */}
      <div className="flex-1 min-h-0 min-w-0 max-sm:pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
        {children}
      </div>

      <div
        className={cn(
          "mt-6 pt-4 border-t border-brand-dark/10",
          /* Mobile: full-width stacked CTAs + sticky above home indicator; cancel parent horizontal padding via page wrapper -mx-4 px-4 */
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          "max-sm:sticky max-sm:bottom-0 max-sm:z-30 max-sm:-mx-4 max-sm:px-4 max-sm:pt-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:bg-white max-sm:shadow-[0_-10px_30px_-12px_rgba(0,28,48,0.15)]"
        )}
      >
        <div className="flex w-full sm:w-auto sm:min-w-0 sm:flex-1 justify-start order-2 sm:order-1">
          {!hideBack && !isFirst && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[48px] w-full sm:w-auto px-4 sm:px-3 sm:-ml-3 rounded-xl text-brand-primary hover:bg-brand-primary/10 font-medium touch-manipulation border border-brand-primary/25 sm:border-0"
            >
              {backLabel}
            </button>
          ) : (
            <span className="hidden sm:block sm:min-w-[4rem]" aria-hidden />
          )}
        </div>
        <div className="w-full sm:w-auto sm:flex-shrink-0 order-1 sm:order-2">
          {!hideNext && onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-h-[52px] w-full sm:w-auto sm:min-w-[120px] rounded-xl bg-brand-primary text-white px-5 sm:px-6 py-3 text-base font-semibold hover:bg-brand-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors touch-manipulation inline-flex items-center justify-center gap-2"
            >
              {nextLoading && (
                <svg
                  className="animate-spin h-5 w-5 shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
