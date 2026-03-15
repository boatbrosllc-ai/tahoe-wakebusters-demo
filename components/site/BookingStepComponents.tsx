/**
 * Step components for BookingModal to reduce file size and allow testing step logic in isolation.
 * Each component receives only the props it needs.
 *
 * TODO: Move corresponding JSX from BookingModal into these components.
 * - BookingStep1Categories: category grid
 * - BookingStep2Calendar: duration + calendar + time picker
 * - BookingStep3Boats: boat list
 * - BookingStep4Checkout: details form + payment
 */

import { ReactNode } from "react";

export function BookingStep1Categories(_props: { children: ReactNode }) {
  return <>{_props.children}</>;
}

export function BookingStep2Calendar(_props: { children: ReactNode }) {
  return <>{_props.children}</>;
}

export function BookingStep3Boats(_props: { children: ReactNode }) {
  return <>{_props.children}</>;
}

export function BookingStep4Checkout(_props: { children: ReactNode }) {
  return <>{_props.children}</>;
}
