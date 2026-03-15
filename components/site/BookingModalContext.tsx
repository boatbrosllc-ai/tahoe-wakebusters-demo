"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export interface BookingModalInitialSelection {
  experienceId?: string;
  experienceSlug?: string;
  boatId?: string;
  date?: string;
  slotId?: string;
  pricingType?: "charter" | "ticketed";
  /** When set, modal uses this for ticketed flows instead of hardcoded 'shared' (e.g. after auto-switch to charter on calendar). */
  bookingMode?: "shared" | "charter";
  /** From calendar/slug fetch so modal can validate slot before hold creation. */
  departureHour?: number;
  departureMinute?: number;
}

type BookingModalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialSelection: BookingModalInitialSelection | null;
  /** Incremented each time openWithSelection is called so modal can reset form when selection changes while already open. */
  selectionKey: number;
  openWithSelection: (selection: BookingModalInitialSelection) => void;
  clearInitialSelection: () => void;
};

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialSelection, setInitialSelection] = useState<BookingModalInitialSelection | null>(null);
  const selectionKeyRef = useRef(0);
  const [selectionKey, setSelectionKey] = useState(0);

  const openWithSelection = useCallback((selection: BookingModalInitialSelection) => {
    selectionKeyRef.current += 1;
    setSelectionKey(selectionKeyRef.current);
    setInitialSelection(selection);
    setOpen(true);
  }, []);

  const clearInitialSelection = useCallback(() => {
    setInitialSelection(null);
  }, []);

  const handleSetOpen = useCallback(
    (next: boolean) => {
      if (!next) setInitialSelection(null);
      setOpen(next);
    },
    []
  );

  return (
    <BookingModalContext.Provider
      value={{
        open,
        setOpen: handleSetOpen,
        initialSelection,
        selectionKey,
        openWithSelection,
        clearInitialSelection,
      }}
    >
      {children}
    </BookingModalContext.Provider>
  );
}

export function useBookingModal() {
  const ctx = useContext(BookingModalContext);
  if (!ctx) {
    throw new Error("useBookingModal must be used within BookingModalProvider");
  }
  return ctx;
}
