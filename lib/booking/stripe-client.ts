/**
 * Stripe client — server-side only. Used for Checkout Session and webhook verification.
 */

import Stripe from "stripe";
import { bookingEnv } from "./env";
import type { BookingPricing, Hold, Rate, Addon } from "./types";
import type { ExperienceRate } from "./types";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(bookingEnv.stripeSecretKey, { apiVersion: "2023-10-16" });
  }
  return stripe;
}

function rateBaseCents(rate: Rate | ExperienceRate): number {
  if ("basePriceCents" in rate && rate.basePriceCents != null) return rate.basePriceCents;
  const cents = (rate as ExperienceRate & { priceCents?: number }).priceCents;
  if (typeof cents === "number") return cents;
  return 0;
}

export function buildLineItems(params: {
  pricing: BookingPricing;
  rate: Rate | ExperienceRate;
  addons: { addon: Addon | import("./types").ExperienceAddon; qty: number }[];
  hold: Hold;
  /** For ticketed experiences: number of tickets purchased. Defaults to 1. */
  ticketQty?: number;
  /** Override the unit price in cents (e.g. per-ticket price for ticketed experiences). */
  unitPriceCents?: number;
}): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const { pricing, rate, addons } = params;
  const ticketQty = params.ticketQty != null && params.ticketQty > 0 ? params.ticketQty : 1;
  const isTicketed = ticketQty > 1;
  const unitPrice = params.unitPriceCents != null ? params.unitPriceCents : rateBaseCents(rate);
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  lineItems.push({
    price_data: {
      currency: pricing.currency,
      unit_amount: unitPrice,
      product_data: {
        name: isTicketed ? `${rate.displayName} · ${ticketQty} ticket${ticketQty !== 1 ? "s" : ""}` : `${rate.displayName} Charter`,
        description: isTicketed ? `${rate.durationHours} hr · $${(unitPrice / 100).toFixed(0)} per ticket` : `${rate.durationHours} hour boat rental`,
      },
    },
    quantity: ticketQty,
  });
  for (const { addon, qty } of addons) {
    if (qty <= 0) continue;
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: addon.priceCents,
        product_data: {
          name: addon.name,
        },
      },
      quantity: qty,
    });
  }
  if (pricing.taxCents > 0) {
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: pricing.taxCents,
        product_data: {
          name: "Tax",
        },
      },
      quantity: 1,
    });
  }
  if (pricing.feesCents > 0) {
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: pricing.feesCents,
        product_data: {
          name: "Booking fee",
        },
      },
      quantity: 1,
    });
  }
  return lineItems;
}
