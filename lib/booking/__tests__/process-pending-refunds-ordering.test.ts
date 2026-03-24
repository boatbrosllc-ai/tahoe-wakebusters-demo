import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isPendingRefundDueForProcessing,
  PENDING_REFUND_PROCESSOR_PAGE_SIZE,
  PENDING_REFUND_PROCESSOR_RUN_BUDGET,
} from "../pending-refund-ordering";

/** Firestore ascending `orderBy("nextRetryAt")` for documents that all include `nextRetryAt`. */
function sortLikeFirestoreNextRetryAsc(
  rows: { id: string; nextMs: number }[]
): { id: string; nextMs: number }[] {
  return [...rows].sort((a, b) => {
    if (a.nextMs !== b.nextMs) return a.nextMs - b.nextMs;
    return a.id.localeCompare(b.id);
  });
}

describe("processPendingRefundsBatch due ordering", () => {
  it("exports page size and per-run budget for cron tuning", () => {
    assert.strictEqual(PENDING_REFUND_PROCESSOR_PAGE_SIZE, 40);
    assert.strictEqual(PENDING_REFUND_PROCESSOR_RUN_BUDGET, 40);
  });

  it("treats missing nextRetryAt as not due (excluded from ordered query until backfilled)", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    assert.strictEqual(isPendingRefundDueForProcessing({}, now), false);
    assert.strictEqual(isPendingRefundDueForProcessing({ nextRetryAt: undefined }, now), false);
  });

  it("due vs future matches processor gate", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const past = { toDate: () => new Date("2025-05-01T12:00:00Z") };
    const future = { toDate: () => new Date("2026-01-01T12:00:00Z") };
    assert.strictEqual(isPendingRefundDueForProcessing({ nextRetryAt: past }, now), true);
    assert.strictEqual(isPendingRefundDueForProcessing({ nextRetryAt: future }, now), false);
  });

  it("more than one page: oldest nextRetryAt rows are visited first (matches production query)", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const futureMs = new Date("2026-01-01T00:00:00Z").getTime();
    const pastBase = new Date("2025-01-01T00:00:00Z").getTime();
    const rows: { id: string; nextMs: number }[] = [];
    for (let i = 0; i < PENDING_REFUND_PROCESSOR_PAGE_SIZE; i++) {
      rows.push({ id: `future-${i}`, nextMs: futureMs + i });
    }
    for (let i = 0; i < PENDING_REFUND_PROCESSOR_PAGE_SIZE; i++) {
      rows.push({ id: `due-${i}`, nextMs: pastBase + i });
    }
    const ordered = sortLikeFirestoreNextRetryAsc(rows);
    assert.ok(
      ordered.slice(0, PENDING_REFUND_PROCESSOR_PAGE_SIZE).every((r) => r.id.startsWith("due-")),
      "rows with earlier nextRetryAt sort before later timestamps"
    );
    let processed = 0;
    for (const r of ordered) {
      const next = { toDate: () => new Date(r.nextMs) };
      if (!isPendingRefundDueForProcessing({ nextRetryAt: next }, now)) break;
      processed++;
      if (processed >= PENDING_REFUND_PROCESSOR_RUN_BUDGET) break;
    }
    assert.strictEqual(processed, PENDING_REFUND_PROCESSOR_RUN_BUDGET);
    assert.ok(ordered.slice(0, processed).every((r) => r.id.startsWith("due-")));
  });
});
