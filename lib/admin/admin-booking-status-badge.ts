/**
 * Tailwind class strings for booking status chips across admin surfaces (bookings list, dashboard, financials).
 * Success = payment-complete; in-progress = deposit/final pipeline; failures and cancels align with bookings admin.
 */
export function getAdminBookingStatusBadgeClass(status: string): string {
  const s = status ?? "";
  if (s === "paid" || s === "final_paid") return "bg-green-100 text-green-800";
  if (s === "canceled" || s === "refunded") return "bg-amber-100 text-amber-800";
  if (s === "final_failed" || s === "final_requires_action") return "bg-red-100 text-red-800";
  if (s === "final_due" || s === "deposit_paid") return "bg-blue-100 text-blue-800";
  if (s === "final_processing") return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-800";
}
