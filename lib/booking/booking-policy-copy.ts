/**
 * Customer-facing deposit, balance, fuel, and gratuity copy derived from site config.
 * Shared by modal checkout, inline checkout, emails, and success page.
 */

import { siteConfig } from "@/config/site";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import {
  getDepositLeadTimeHours,
  getFuelGratuityConfig,
  shouldAutoChargeRemainingBalance,
  shouldForceFullPaymentAtCheckout,
} from "@/lib/booking/customer-operations";

export function getDepositPercentLabel(): string {
  return `${Math.round(DEPOSIT_FRACTION * 100)}%`;
}

export function getDepositPercentNumber(): number {
  return Math.round(DEPOSIT_FRACTION * 100);
}

/** e.g. "48 hours before your trip" or "on arrival" */
export function formatBalanceLeadTimePhrase(hours?: number): string {
  const timing = siteConfig.booking.balanceTiming ?? "hours_before";
  if (timing === "on_arrival") return "on arrival";
  const h = hours ?? getDepositLeadTimeHours();
  if (h <= 0) return "at booking";
  return `${h} hour${h === 1 ? "" : "s"} before your trip`;
}

/** Full sentence for deposit confirmation emails and success page. */
export function formatAutoChargeBalanceSentence(hours?: number): string {
  const timing = siteConfig.booking.balanceTiming ?? "hours_before";
  if (timing === "on_arrival") {
    return "The remaining balance is due on arrival.";
  }
  if (shouldForceFullPaymentAtCheckout()) {
    return "Full payment is collected at booking.";
  }
  return `The remaining balance will be charged automatically ${formatBalanceLeadTimePhrase(hours)}.`;
}

/** Compact label for checkout summaries, e.g. "Remaining balance charged 48h before trip". */
export function formatRemainingBalanceShort(hours?: number): string {
  const timing = siteConfig.booking.balanceTiming ?? "hours_before";
  if (timing === "on_arrival") return "Remaining balance due on arrival";
  const h = hours ?? getDepositLeadTimeHours();
  if (h <= 0) return "Full amount due now";
  return `Remaining balance charged ${h}h before trip`;
}

/** Short parenthetical for payment option rows. */
export function formatDepositBalanceTimingHint(hours?: number): string {
  const timing = siteConfig.booking.balanceTiming ?? "hours_before";
  if (timing === "on_arrival") return "remaining balance due on arrival";
  const h = hours ?? getDepositLeadTimeHours();
  return `remaining balance charged ${h}h before your trip`;
}

/**
 * Whether charter checkout may offer a deposit (vs full payment only).
 * Safe default: deposit only when fraction < 1 and balance is not forced at booking.
 */
export function resolveAllowDepositFromConfig(config = siteConfig): boolean {
  const fraction = config.booking.depositFraction;
  if (typeof fraction !== "number" || fraction >= 1) return false;
  const timing = config.booking.balanceTiming ?? "hours_before";
  if (timing === "at_booking") return false;
  return true;
}

export function getGratuityPolicyCopy(): string {
  const fuelGratuity = getFuelGratuityConfig();
  const gratuityPercent = fuelGratuity?.suggestedGratuityPercent ?? 20;
  if (fuelGratuity?.gratuityNotes?.trim()) return fuelGratuity.gratuityNotes.trim();
  if (fuelGratuity?.gratuityPolicy === "included") {
    return "Gratuity is included in your charter price.";
  }
  if (fuelGratuity?.gratuityPolicy === "not_included") {
    return "Gratuity is not included — please tip your crew directly at the end of the trip.";
  }
  return `A ${gratuityPercent}% gratuity is customary for private charters. Gratuity is paid directly to your captain at the end of the trip.`;
}

export function getFuelPolicyCopy(): string | null {
  return getFuelGratuityConfig()?.fuelSurchargeLabel?.trim() || null;
}
