import Link from "next/link";
import {
  FOUNDING_ANGLER_LABEL,
  FOUNDING_ANGLER_RATE_ACTIVE,
  FOUNDING_RATE_CENTS,
  STANDARD_RATE_CENTS,
  PEAK_FULL_DAY_CENTS,
  formatUsdFromCents,
  CHARTER_INCLUDED,
  getActiveCatalogRateCents,
} from "@/content/catalog-pricing";
import { PROCESSING_FEE_RATE } from "@/lib/booking/constants";

/**
 * Server-rendered pricing preview from catalog config (not a second pricing engine).
 * Tax is intentionally not shown as a fixed number — live checkout uses TAX_RATE.
 */
export function CharterPriceCards({ compact = false }: { compact?: boolean }) {
  const halfActive = getActiveCatalogRateCents("half");
  const fullActive = getActiveCatalogRateCents("full");
  const foundingOn = FOUNDING_ANGLER_RATE_ACTIVE;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-brand-dark/10 bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Half Day</p>
          <h3 className="mt-1 font-display text-xl font-bold text-brand-dark">5 hours</h3>
          <p className="mt-3 text-2xl font-bold text-brand-dark tabular-nums">{formatUsdFromCents(halfActive)}</p>
          {foundingOn ? (
            <p className="mt-1 text-sm text-brand-muted">
              {FOUNDING_ANGLER_LABEL} · standard {formatUsdFromCents(STANDARD_RATE_CENTS.half)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-brand-muted">Before tax · private charter</p>
          )}
          <Link
            href="/experiences/half-day"
            className="mt-4 inline-block text-sm font-semibold text-brand-primary hover:underline"
          >
            Half Day details
          </Link>
        </div>
        <div className="rounded-2xl border border-brand-dark/10 bg-white p-5 sm:p-6 ring-1 ring-brand-primary/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Full Day</p>
          <h3 className="mt-1 font-display text-xl font-bold text-brand-dark">8 hours</h3>
          <p className="mt-3 text-2xl font-bold text-brand-dark tabular-nums">{formatUsdFromCents(fullActive)}</p>
          {foundingOn ? (
            <p className="mt-1 text-sm text-brand-muted">
              {FOUNDING_ANGLER_LABEL} · standard {formatUsdFromCents(STANDARD_RATE_CENTS.full)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-brand-muted">Before tax · private charter</p>
          )}
          <p className="mt-2 text-sm text-brand-muted">
            Peak / holiday windows from {formatUsdFromCents(PEAK_FULL_DAY_CENTS)} when configured
          </p>
          <Link
            href="/experiences/full-day"
            className="mt-4 inline-block text-sm font-semibold text-brand-primary hover:underline"
          >
            Full Day details
          </Link>
        </div>
      </div>

      {!compact && (
        <>
          <div>
            <h3 className="font-display text-lg font-bold text-brand-dark mb-2">What’s included</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-brand-dark/85">
              {CHARTER_INCLUDED.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-brand-primary" aria-hidden>
                    ·
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-brand-muted leading-relaxed">
            {PROCESSING_FEE_RATE === 0
              ? "No separate customer processing surcharge at checkout — published rates are what you see for the charter base."
              : "Checkout fees follow the live booking configuration."}{" "}
            Applicable tax is calculated in the booking flow. Deposits are available when the trip date qualifies.
            Add-ons (transport, meals, offshore run, and more) are optional and priced in checkout.
          </p>
          {!foundingOn && (
            <p className="text-sm text-brand-muted">
              Founding rates ({formatUsdFromCents(FOUNDING_RATE_CENTS.half)} /{" "}
              {formatUsdFromCents(FOUNDING_RATE_CENTS.full)}) are not currently active.
            </p>
          )}
        </>
      )}
    </div>
  );
}
