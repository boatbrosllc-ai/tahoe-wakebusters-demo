/**
 * Shared booking constants. No server-only imports so both client and server can use.
 * Single source of truth for values that must match between display and charge (e.g. tax rate).
 */

/** Texas combined sales tax (e.g. Austin: state 6.25% + local up to 2% = 8.25%). */
export const TAX_RATE = 0.0825;
