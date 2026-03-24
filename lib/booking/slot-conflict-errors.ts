/** Slot / block conflict errors — no Firebase imports (safe for tests and client). */

export class SlotConflictError extends Error {
  constructor(message: "Slot no longer available" | "This slot is blocked") {
    super(message);
    this.name = "SlotConflictError";
  }
}
