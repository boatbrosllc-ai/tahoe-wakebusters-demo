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
    // Use the stable API version shipped with this SDK; see https://docs.stripe.com/api/versioning
    const version = typeof (Stripe as unknown as { LatestApiVersion?: string }).LatestApiVersion === "string"
      ? (Stripe as unknown as { LatestApiVersion: string }).LatestApiVersion
      : "2024-09-30.acacia";
    stripe = new Stripe(bookingEnv.stripeSecretKey, { apiVersion: version as Stripe.LatestApiVersion });
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
  const { pricing, rate, addons, hold } = params;
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
  const tipCents = (hold as { tipCents?: number }).tipCents ?? 0;
  if (tipCents > 0) {
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: tipCents,
        product_data: { name: "Tip (gratuity)" },
      },
      quantity: 1,
    });
  }
  return lineItems;
}

/**
 * Checkout line items from the hold's captured `pricing` + addon snapshot so totals match create-payment-intent
 * even when live Firestore addon prices change after hold creation.
 */
export function buildLineItemsFromHoldPricing(params: {
  pricing: BookingPricing;
  rate: Rate | ExperienceRate;
  hold: Hold;
  ticketQty?: number;
}): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const { pricing, rate, hold } = params;
  const ticketQty = params.ticketQty != null && params.ticketQty > 0 ? params.ticketQty : 1;
  const isTicketed = ticketQty > 1;
  const selections = hold.addonSelections ?? [];
  let addonSubtotal = 0;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const sel of selections) {
    const qty = Math.max(0, Math.floor(Number(sel.qty)));
    if (qty <= 0) continue;
    const unit =
      typeof sel.priceCents === "number" && Number.isFinite(sel.priceCents)
        ? Math.max(0, Math.floor(sel.priceCents))
        : 0;
    addonSubtotal += unit * qty;
    const label = typeof sel.name === "string" && sel.name.trim() ? sel.name.trim() : "Add-on";
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: unit,
        product_data: { name: label },
      },
      quantity: qty,
    });
  }
  const basePortion = Math.max(0, pricing.subtotalCents - addonSubtotal);
  const perTicketHint = hold.effectiveRateCents != null ? hold.effectiveRateCents : rateBaseCents(rate);
  if (isTicketed) {
    // Single subtotal line matches `pricing.subtotalCents` exactly (avoids per-ticket rounding drift vs PI).
    lineItems.unshift({
      price_data: {
        currency: pricing.currency,
        unit_amount: basePortion,
        product_data: {
          name: `${rate.displayName} · ${ticketQty} ticket${ticketQty !== 1 ? "s" : ""}`,
          description: `${rate.durationHours} hr · $${(perTicketHint / 100).toFixed(0)} per ticket`,
        },
      },
      quantity: 1,
    });
  } else {
    lineItems.unshift({
      price_data: {
        currency: pricing.currency,
        unit_amount: basePortion,
        product_data: {
          name: `${rate.displayName} Charter`,
          description: `${rate.durationHours} hour boat rental`,
        },
      },
      quantity: 1,
    });
  }
  if (pricing.taxCents > 0) {
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: pricing.taxCents,
        product_data: { name: "Tax" },
      },
      quantity: 1,
    });
  }
  if (pricing.feesCents > 0) {
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: pricing.feesCents,
        product_data: { name: "Booking fee" },
      },
      quantity: 1,
    });
  }
  const tipCents = (hold as { tipCents?: number }).tipCents ?? 0;
  if (tipCents > 0) {
    lineItems.push({
      price_data: {
        currency: pricing.currency,
        unit_amount: tipCents,
        product_data: { name: "Tip (gratuity)" },
      },
      quantity: 1,
    });
  }
  return lineItems;
}
