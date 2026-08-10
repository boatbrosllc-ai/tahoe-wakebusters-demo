import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateFinishedWeightRange,
  calculatePortions,
  calculateProcessingCostUsd,
  estimateProcessing,
  formatRange,
  formatUsdRange,
  getYieldRangePct,
} from "../calculations";

describe("fish processing yield bands (yellowfin)", () => {
  it("20 lb tuna uses 25–30% band", () => {
    const y = getYieldRangePct("yellowfin", 20);
    assert.deepEqual(y, { lowPct: 25, highPct: 30 });
  });

  it("50 lb tuna uses 30–35% band", () => {
    const y = getYieldRangePct("yellowfin", 50);
    assert.deepEqual(y, { lowPct: 30, highPct: 35 });
  });

  it("100 lb tuna uses 35–38% band", () => {
    const y = getYieldRangePct("yellowfin", 100);
    assert.deepEqual(y, { lowPct: 35, highPct: 38 });
  });

  it("150 lb tuna uses 38–40% band", () => {
    const y = getYieldRangePct("yellowfin", 150);
    assert.deepEqual(y, { lowPct: 38, highPct: 40 });
  });
});

describe("fish processing estimates", () => {
  it("20 lb tuna finished weight and minimum processing charge", () => {
    const e = estimateProcessing("yellowfin", 20);
    assert.equal(e.finishedLowLb, 5);
    assert.equal(e.finishedHighLb, 6);
    // 5–6 lb × $2–$3 still under $30 minimum on the low end
    assert.equal(e.processingLowUsd, 30);
    assert.equal(e.processingHighUsd, 30);
    assert.equal(e.appliedMinimum, true);
  });

  it("50 lb tuna", () => {
    const e = estimateProcessing("yellowfin", 50);
    assert.equal(e.finishedLowLb, 15);
    assert.equal(e.finishedHighLb, 18);
    // 15×$2=$30 … 18×$3=$54
    assert.equal(e.processingLowUsd, 30);
    assert.equal(e.processingHighUsd, 54);
  });

  it("100 lb tuna matches planning example (~35–38 lb, $70–$114 at $2–$3/lb)", () => {
    const e = estimateProcessing("yellowfin", 100);
    assert.equal(e.finishedLowLb, 35);
    assert.equal(e.finishedHighLb, 38);
    assert.equal(e.processingLowUsd, 70);
    assert.equal(e.processingHighUsd, 114);
    assert.equal(e.appliedMinimum, false);
  });

  it("150 lb tuna", () => {
    const e = estimateProcessing("yellowfin", 150);
    assert.equal(e.finishedLowLb, 57);
    assert.equal(e.finishedHighLb, 60);
    // 57×$2=$114 … 60×$3=$180
    assert.equal(e.processingLowUsd, 114);
    assert.equal(e.processingHighUsd, 180);
  });
});

describe("processing cost helpers", () => {
  it("applies $30 minimum when finished weight is small", () => {
    const { costUsd, appliedMinimum } = calculateProcessingCostUsd(5);
    assert.equal(costUsd, 30);
    assert.equal(appliedMinimum, true);
  });

  it("charges $2 per finished pound above minimum at the low rate", () => {
    const { costUsd, appliedMinimum } = calculateProcessingCostUsd(38);
    assert.equal(costUsd, 76);
    assert.equal(appliedMinimum, false);
  });

  it("charges $3 per finished pound at the high rate", () => {
    const { costUsd, appliedMinimum } = calculateProcessingCostUsd(38, 3);
    assert.equal(costUsd, 114);
    assert.equal(appliedMinimum, false);
  });
});

describe("portion math", () => {
  it("calculates 8 oz and 12 oz portions from finished pounds", () => {
    assert.equal(calculatePortions(38, 8), 76);
    assert.equal(calculatePortions(38, 12), 50); // 38*16/12 = 50.666… → 50 (floor)
  });

  it("100 lb tuna portion ranges use finished yield", () => {
    const e = estimateProcessing("yellowfin", 100);
    assert.equal(e.portions8ozLow, calculatePortions(35, 8));
    assert.equal(e.portions8ozHigh, calculatePortions(38, 8));
    assert.equal(e.portions12ozLow, calculatePortions(35, 12));
    assert.equal(e.portions12ozHigh, calculatePortions(38, 12));
  });
});

describe("range formatting", () => {
  it("collapses identical bounds", () => {
    assert.equal(formatRange(30, 30, { prefix: "$" }), "$30");
    assert.equal(formatUsdRange(30, 30), "$30");
  });

  it("shows ranges when bounds differ", () => {
    assert.equal(formatRange(35, 38, { suffix: " LB" }), "35–38 LB");
    assert.equal(formatUsdRange(70, 76), "$70–$76");
  });

  it("finished weight helper keeps low ≤ high", () => {
    const r = calculateFinishedWeightRange(100, 38, 35);
    assert.equal(r.finishedLowLb, 35);
    assert.equal(r.finishedHighLb, 38);
  });
});
