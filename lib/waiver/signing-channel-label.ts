/** Human-readable label for how the guest accessed the waiver (admin UI). */

export function isWalkInWaiverRequest(d: { signingChannel?: string; bookingId?: string }): boolean {
  return d.signingChannel === "qr_kiosk" || (d.bookingId?.startsWith("walkin-") ?? false);
}

export function waiverSigningChannelLabel(signingChannel?: string, bookingId?: string): string {
  if (signingChannel === "qr_kiosk" || bookingId?.startsWith("walkin-")) return "Walk-in / QR";
  if (signingChannel === "group") return "Group booking link";
  return "Email invite link";
}
