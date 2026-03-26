/** Slot / block conflict errors — no Firebase imports (safe for tests and client). */

export type SlotConflictMessage =
  | "Slot no longer available"
  | "This slot is blocked"
  | "Shared tickets have already been sold for this departure";

export class SlotConflictError extends Error {
  constructor(message: SlotConflictMessage) {
    super(message);
    this.name = "SlotConflictError";
  }
}
