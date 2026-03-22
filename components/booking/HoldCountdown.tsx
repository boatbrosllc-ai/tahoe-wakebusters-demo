"use client";

import { useEffect, useState } from "react";

interface HoldCountdownProps {
  /** ISO date string when the hold expires */
  expiresAt: string;
  /** Optional label before the time, e.g. "Complete payment in" */
  label?: string;
  /** Compact format: "9:45" instead of "9 min 45 sec" */
  compact?: boolean;
  /** When time expires, show this instead of hiding (e.g. "Expired") */
  expiredLabel?: string;
  /** Called once when the countdown reaches zero */
  onExpired?: () => void;
  className?: string;
}

function getRemaining(expiresAt: string): { minutes: number; seconds: number } | null {
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((end - now) / 1000));
  if (diff <= 0) return null;
  return { minutes: Math.floor(diff / 60), seconds: diff % 60 };
}

export function HoldCountdown({
  expiresAt,
  label = "Complete payment in",
  compact = false,
  expiredLabel,
  onExpired,
  className = "",
}: HoldCountdownProps) {
  const [remaining, setRemaining] = useState<{ minutes: number; seconds: number } | null>(() =>
    getRemaining(expiresAt)
  );

  useEffect(() => {
    const r0 = getRemaining(expiresAt);
    setRemaining(r0);
    if (!r0) {
      onExpired?.();
      return;
    }
    const t = setInterval(() => {
      const r = getRemaining(expiresAt);
      setRemaining(r);
      if (!r) {
        clearInterval(t);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpired]);

  if (remaining === null) {
    if (expiredLabel) {
      return (
        <span className={className}>
          <span>{expiredLabel}</span>
          <span className="sr-only" aria-live="assertive" aria-atomic="true">
            Time expired. Your checkout reservation has expired. Please start over to book again.
          </span>
        </span>
      );
    }
    return null;
  }

  const { minutes, seconds } = remaining;
  const timeStr = compact
    ? `${minutes}:${seconds.toString().padStart(2, "0")}`
    : `${minutes} min ${seconds} sec`;

  // Announce notable milestones to screen readers (2 min, 1 min, 30 sec).
  const milestone =
    minutes === 2 && seconds === 0
      ? "2 minutes remaining"
      : minutes === 1 && seconds === 0
        ? "1 minute remaining"
        : minutes === 0 && seconds === 30
          ? "30 seconds remaining"
          : null;

  return (
    <span className={className}>
      <span role="timer">{label} {timeStr}</span>
      {milestone ? (
        <span className="sr-only" aria-live="assertive" aria-atomic="true">
          {milestone}
        </span>
      ) : null}
    </span>
  );
}
