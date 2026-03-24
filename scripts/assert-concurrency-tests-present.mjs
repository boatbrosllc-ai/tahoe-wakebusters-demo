/**
 * CI guard: concurrency integration test files must remain and keep at least one non-trivial test
 * so refactors cannot silently drop emulator-backed coverage.
 */
import fs from "fs";

const files = [
  "tests/booking-two-tab-concurrency.integration.test.ts",
  "tests/direct-checkout-slot-concurrency.integration.test.ts",
];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`[assert-concurrency-tests] missing file: ${f}`);
    process.exit(1);
  }
  const t = fs.readFileSync(f, "utf8");
  const itCount = (t.match(/^\s*it\(/gm) ?? []).length;
  if (itCount < 1) {
    console.error(`[assert-concurrency-tests] ${f} must contain at least one it(`);
    process.exit(1);
  }
}

console.log("[assert-concurrency-tests] ok:", files.length, "files with it() tests");
