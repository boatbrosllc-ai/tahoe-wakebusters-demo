/**
 * Pins two-phase transaction ordering in slot-reset (all reads before writes).
 * Avoids importing firebase-admin (server-only) in the test runner.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("resetBookingSlotsToOpenInTransaction (source ordering)", () => {
  it("reads slots sequentially before betweenReadsAndWrites and before applyBookingSlotOpensFromSnapshots writes", () => {
    const src = readFileSync(join(__dirname, "../slot-reset.ts"), "utf8");
    const resetStart = src.indexOf("export async function resetBookingSlotsToOpenInTransaction");
    assert.ok(resetStart >= 0);
    const resetSlice = src.slice(resetStart, resetStart + 2200);
    const forIdx = resetSlice.indexOf("for (const ref of refList)");
    const betweenIdx = resetSlice.indexOf("await opts?.betweenReadsAndWrites?.(tx)");
    const retIdx = resetSlice.indexOf("return applyBookingSlotOpensFromSnapshots");
    assert.ok(forIdx >= 0 && betweenIdx >= 0 && retIdx >= 0);
    assert.ok(forIdx < betweenIdx && betweenIdx < retIdx, "read loop → optional hook → apply writes");
  });
});
