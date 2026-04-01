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
  it("reads all slot snapshots before betweenReadsAndWrites and before any tx.set", () => {
    const src = readFileSync(join(__dirname, "../slot-reset.ts"), "utf8");
    const snapshotsIdx = src.indexOf("const snapshots = await Promise.all(refList.map((ref) => tx.get(ref)))");
    const betweenIdx = src.indexOf("await opts?.betweenReadsAndWrites?.(tx)");
    const firstSetInLoop = src.indexOf("tx.set(");
    assert.ok(snapshotsIdx >= 0, "expected snapshot batch read");
    assert.ok(betweenIdx >= 0, "expected betweenReadsAndWrites hook");
    assert.ok(firstSetInLoop >= 0, "expected tx.set writes");
    assert.ok(snapshotsIdx < betweenIdx, "snapshots must be read before betweenReadsAndWrites");
    assert.ok(betweenIdx < firstSetInLoop, "betweenReadsAndWrites must run before first tx.set");
  });
});
