"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { BookingModalInitialSelection } from "@/lib/booking/booking-modal-types";

export type { BookingModalInitialSelection };

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
