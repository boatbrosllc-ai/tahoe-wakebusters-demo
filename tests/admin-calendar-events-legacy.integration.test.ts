/**
 * Regression: admin calendar must include bookings missing startDateStr when slotId
 * parses to a trip date in range (same legacy fallback as experience-filtered queries).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { buildSlotId, parseSlotIdRelaxed } from "../lib/booking/experience-slots";

describe("admin calendar-events legacy startDateStr fallback", () => {
  const fromStr = "2030-06-01";
  const toStr = "2030-06-30";

  it("broad calendar: trip date from slotId when startDateStr is absent", () => {
    const slotId = buildSlotId("2030-06-15", 10, 3);
    const d = { startDateStr: undefined as string | undefined, slotId };
    if (d.startDateStr) assert.fail("test expects missing startDateStr");
    const parsed = parseSlotIdRelaxed(d.slotId ?? "");
    const dateStr = parsed?.dateStr ?? null;
    assert.ok(dateStr && dateStr >= fromStr && dateStr <= toStr, "legacy row falls in range");
  });

  it("filtered calendar: same slot parse as all-experience path", () => {
    const slotId = buildSlotId("2030-06-20", 14, 2);
    const parsed = parseSlotIdRelaxed(slotId);
    const dateStr = parsed?.dateStr ?? null;
    assert.strictEqual(dateStr, "2030-06-20");
    assert.ok(dateStr! >= fromStr && dateStr! <= toStr);
  });
});
