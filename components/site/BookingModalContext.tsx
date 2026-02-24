"use client";

import { createContext, useCallback, useContext, useState } from "react";

export interface BookingModalInitialSelection {
  experienceId?: string;
  experienceSlug?: string;
  boatId?: string;
  date?: string;
  slotId?: string;
  pricingType?: "charter" | "ticketed";
}

type BookingModalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialSelection: BookingModalInitialSelection | null;
  openWithSelection: (selection: BookingModalInitialSelection) => void;
  clearInitialSelection: () => void;
};

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialSelection, setInitialSelection] = useState<BookingModalInitialSelection | null>(null);

  const openWithSelection = useCallback((selection: BookingModalInitialSelection) => {
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
