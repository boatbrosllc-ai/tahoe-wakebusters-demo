/**
 * Shared booking CTA for customer frontends.
 *
 * Customer sites should import this (or `BookingCTA`) instead of copying
 * checkout / availability logic. It opens the shared booking modal.
 */
export { BookingCTA as BookingWidget } from "@/components/site/BookingCTA";
export type { BookingCTAProps as BookingWidgetProps } from "@/components/site/BookingCTA";
