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
  hideBack = false,
  hideNext = false,
  children,
  className,
}: StepperProps) {
  const isFirst = currentStepIndex <= 0;
  const isLast = currentStepIndex >= steps.length - 1;

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                "flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-full text-sm font-medium border-2 transition-colors shrink-0",
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
                  "w-6 sm:w-8 h-0.5 rounded shrink",
                  i < currentStepIndex ? "bg-brand-primary" : "bg-brand-dark/20"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="text-center text-sm text-brand-muted mb-4" aria-live="polite">
        Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex]?.label}
      </p>

      <div className="flex-1 min-h-0">{children}</div>

      <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-brand-dark/10">
        <div className="min-w-[4rem]">
          {!hideBack && !isFirst && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[48px] px-3 -ml-3 rounded-xl text-brand-primary hover:bg-brand-primary/10 font-medium touch-manipulation"
            >
              {backLabel}
            </button>
          )}
        </div>
        <div>
          {!hideNext && onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-h-[48px] min-w-[120px] rounded-xl bg-brand-primary text-white px-6 py-3 text-base font-medium hover:bg-brand-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors touch-manipulation"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
