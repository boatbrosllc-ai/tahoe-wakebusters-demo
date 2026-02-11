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
  return (rate as ExperienceRate).priceCents;
}

export function buildLineItems(params: {
  pricing: BookingPricing;
  rate: Rate | ExperienceRate;
  addons: { addon: Addon | import("./types").ExperienceAddon; qty: number }[];
  hold: Hold;
}): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const { pricing, rate, addons } = params;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  lineItems.push({
    price_data: {
      currency: pricing.currency,
      unit_amount: rateBaseCents(rate),
      product_data: {
        name: `${rate.displayName} Charter`,
        description: `${rate.durationHours} hour boat rental`,
      },
    },
    quantity: 1,
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
