/**
 * Payment orchestration hook for BookingModal.
 * Owns handleProceedToPayment, releaseCreatedHold, handleModalOpenChange.
 * Use with useBookingModalData so the modal only wires step state to these handlers.
 *
 * TODO: Move handleProceedToPayment, releaseCreatedHold, handleModalOpenChange from BookingModal here.
 */
import { useCallback } from "react";

export function useBookingPayment() {
  const releaseCreatedHold = useCallback(
    async (_overrideHoldId?: string | null, _overrideReleaseToken?: string | null) => {
      // TODO: implement using holdId/releaseToken from modal state
    },
    []
  );

  const handleModalOpenChange = useCallback((_nextOpen: boolean) => {
    // TODO: implement guarded close with release
  }, []);

  const handleProceedToPayment = useCallback(async () => {
    // TODO: implement create-hold + create-payment-intent flow
  }, []);

  return {
    handleProceedToPayment,
    releaseCreatedHold,
    handleModalOpenChange,
  };
}
