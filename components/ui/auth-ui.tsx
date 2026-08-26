"use client";

import * as React from "react";
import { useState, useId, useEffect } from "react";
import Image from "next/image";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({
  text,
  speed = 100,
  cursor = "|",
  loop = false,
  deleteSpeed = 50,
  delay = 1500,
  className,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);

  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            setTimeout(() => setIsDeleting(true), delay);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText((prev) => prev.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentIndex(0);
            setTextArrayIndex((prev) => (prev + 1) % textArray.length);
          }
        }
      },
      isDeleting ? deleteSpeed : speed
    );

    return () => clearTimeout(timeout);
  }, [
    currentIndex,
    isDeleting,
    currentText,
    loop,
    speed,
    deleteSpeed,
    delay,
    displayText,
    textArray.length,
  ]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse">{cursor}</span>
    </span>
  );
}

const labelVariants = cva(
  "text-sm font-medium leading-none text-brand-dark peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-brand-dark/15 bg-white px-3 py-3 text-sm text-brand-dark shadow-sm transition-shadow placeholder:text-brand-muted/70",
          "focus-visible:border-brand-primary focus-visible:bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    return (
      <div className="grid w-full items-center gap-2">
        {label ? <Label htmlFor={id}>{label}</Label> : null}
        <div className="relative">
          <Input
            id={id}
            type={showPassword ? "text" : "password"}
            className={cn("pe-10", className)}
            ref={ref}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-brand-muted transition-colors hover:text-brand-dark focus-visible:text-brand-dark focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export interface AuthContentProps {
  image?: {
    src: string;
    alt: string;
  };
  quote?: {
    text: string;
    author: string;
  };
}

interface AuthUIProps {
  /** Form panel content (admin sign-in only — no public signup). */
  children: React.ReactNode;
  content?: AuthContentProps;
  className?: string;
}

const defaultContent: Required<AuthContentProps> = {
  image: {
    src: "/photos/wakebusters/tahoe-shoreline.jpg",
    alt: "Snow-dusted Sierra peaks above Lake Tahoe shoreline",
  },
  quote: {
    text: "Welcome back. The lake is waiting.",
    author: "Tahoe Wakebusters",
  },
};

/**
 * Split auth layout — form on the left, photo + typewriter quote on the right.
 * Admin sign-in only (no public signup / social providers).
 */
export function AuthUI({ children, content = {}, className }: AuthUIProps) {
  const finalContent = {
    image: { ...defaultContent.image, ...content.image },
    quote: { ...defaultContent.quote, ...content.quote },
  };

  return (
    <div className={cn("w-full min-h-screen md:grid md:grid-cols-2", className)}>
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-center bg-white p-6 md:p-10 lg:p-12">
        <div className="mx-auto w-full max-w-[380px]">{children}</div>
      </div>

      <div className="relative hidden overflow-hidden bg-brand-dark md:block">
        <Image
          src={finalContent.image.src}
          alt={finalContent.image.alt}
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/40 to-brand-dark/20" />
        <div className="absolute inset-x-0 bottom-0 h-[140px] bg-gradient-to-t from-brand-dark to-transparent" />

        <div className="relative z-10 flex h-full flex-col items-center justify-end p-8 pb-10">
          <blockquote className="max-w-md space-y-2 text-center text-white">
            <p className="font-display text-lg font-medium leading-snug sm:text-xl">
              “
              <Typewriter key={finalContent.quote.text} text={finalContent.quote.text} speed={60} />
              ”
            </p>
            <cite className="block text-sm font-light not-italic text-white/70">
              — {finalContent.quote.author}
            </cite>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

export { Label, Input, PasswordInput, Button };
