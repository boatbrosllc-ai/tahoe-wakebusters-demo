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
  className = "",
}: HoldCountdownProps) {
  const [remaining, setRemaining] = useState<{ minutes: number; seconds: number } | null>(() =>
    getRemaining(expiresAt)
  );

  useEffect(() => {
    setRemaining(getRemaining(expiresAt));
    const t = setInterval(() => {
      const r = getRemaining(expiresAt);
      setRemaining(r);
      if (!r) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (remaining === null) {
    if (expiredLabel) {
      return <span className={className}>{expiredLabel}</span>;
    }
    return null;
  }

  const { minutes, seconds } = remaining;
  const timeStr = compact
    ? `${minutes}:${seconds.toString().padStart(2, "0")}`
    : `${minutes} min ${seconds} sec`;

  return (
    <span className={className} role="timer" aria-live="polite">
      {label} {timeStr}
    </span>
  );
}
