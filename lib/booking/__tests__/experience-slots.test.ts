/**
 * Unit tests for experience slot ID parsing and slot time windows.
 * Core paths used by hold creation, expiry, and reminder/final-charge crons.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseSlotId,
  parseSlotIdRelaxed,
  buildSlotId,
  getSlotStartEnd,
  getSlotsApiRequestWindow,
  toDateStrOnly,
  isSeasonalAllowed,
  isSaturdayInSlotTimezone,
  isListingBoatCharterStartTimeAllowed,
  isWakeListingBoatType,
  shouldUseWakeBoardCharterGrid,
  getDateStrInSlotTimezone,
  getSlotGridWakeBoard,
  getSlotGrid,
} from "../experience-slots";
import { bookingIntervalMsFromSlotFields, intervalOverlapsRequestWindow } from "../booking-interval";

describe("parseSlotId", () => {
  it("parses 5-part slot id (hour start, no minute)", () => {
    const r = parseSlotId("2025-02-10-13-3");
    assert.ok(r);
    assert.strictEqual(r!.dateStr, "2025-02-10");
    assert.strictEqual(r!.startHour, 13);
    assert.strictEqual(r!.startMinute, 0);
    assert.strictEqual(r!.durationHours, 3);
  });

  it("parses 6-part slot id (with minute)", () => {
    const r = parseSlotId("2025-02-10-9-30-4");
    assert.ok(r);
    assert.strictEqual(r!.dateStr, "2025-02-10");
    assert.strictEqual(r!.startHour, 9);
    assert.strictEqual(r!.startMinute, 30);
    assert.strictEqual(r!.durationHours, 4);
  });

  it("returns null for too few parts", () => {
    assert.strictEqual(parseSlotId("2025-02-10-13"), null);
    assert.strictEqual(parseSlotId("2025-02-10"), null);
  });

  it("returns null for invalid date format", () => {
    assert.strictEqual(parseSlotId("abcd-02-10-13-3"), null);
  });

  it("returns null for invalid minute (only 0 or 30 allowed)", () => {
    assert.strictEqual(parseSlotId("2025-02-10-9-15-4"), null);
  });

  it("returns null when hour or duration tokens are not strictly numeric (no parseInt truncation)", () => {
    assert.strictEqual(parseSlotId("2025-02-10-13a-3"), null);
    assert.strictEqual(parseSlotId("2025-02-10-13-3x"), null);
    assert.strictEqual(parseSlotId("2025-02-10-13-3.5"), null);
  });

  it("returns null for hour or duration out of range", () => {
    assert.strictEqual(parseSlotId("2025-02-10-24-3"), null);
    assert.strictEqual(parseSlotId("2025-02-10-10-0"), null);
  });

  it("returns null for impossible calendar month/day tokens", () => {
    assert.strictEqual(parseSlotId("2025-13-01-10-2"), null);
    assert.strictEqual(parseSlotId("2025-02-32-10-2"), null);
  });
});

describe("parseSlotIdRelaxed", () => {
  it("still normalizes legacy date padding only; rejects junk numeric tokens", () => {
    const r = parseSlotIdRelaxed("2026-2-20-17-3");
    assert.ok(r);
    assert.strictEqual(r!.dateStr, "2026-02-20");
    assert.strictEqual(parseSlotIdRelaxed("2026-2-20-17a-3"), null);
    assert.strictEqual(parseSlotIdRelaxed("2026-2-20-17-3x"), null);
  });
});

describe("bookingIntervalMsFromSlotFields (parse integration)", () => {
  it("returns null for malformed slot ids so overlap logic does not use truncated end times", () => {
    assert.strictEqual(bookingIntervalMsFromSlotFields("2025-02-10-13-3x", undefined), null);
    assert.strictEqual(bookingIntervalMsFromSlotFields(undefined, "2025-02-10-9-30-4x"), null);
  });
});

describe("buildSlotId", () => {
  it("builds 5-part id when startMinute is 0 or omitted", () => {
    assert.strictEqual(buildSlotId("2025-02-10", 13, 3), "2025-02-10-13-3");
    assert.strictEqual(buildSlotId("2025-02-10", 13, 3, 0), "2025-02-10-13-3");
  });

  it("builds 6-part id when startMinute is 30", () => {
    assert.strictEqual(buildSlotId("2025-02-10", 9, 4, 30), "2025-02-10-9-30-4");
  });
});

describe("getSlotsApiRequestWindow", () => {
  it("includes a 7:00 PM Central departure on endDate in the overlap window (regression)", () => {
    const endDate = "2025-06-15";
    const maxDur = 3;
    const { windowStart, windowEnd } = getSlotsApiRequestWindow("2025-06-01", endDate, maxDur);
    const booked = getSlotStartEnd(endDate, 19, maxDur, 0);
    assert.ok(
      intervalOverlapsRequestWindow(booked.start.getTime(), booked.end.getTime(), windowStart, windowEnd),
      "evening trip on range end date should overlap API request window",
    );
    const legacyUtcCutoffEnd = new Date(endDate + "T23:59:59.999Z");
    assert.ok(
      !intervalOverlapsRequestWindow(
        booked.start.getTime(),
        booked.end.getTime(),
        new Date("2025-06-01T12:00:00.000Z"),
        legacyUtcCutoffEnd,
      ),
      "naive UTC end-of-day previously excluded 7pm Central on endDate",
    );
  });
});

describe("getSlotStartEnd", () => {
  it("returns start and end in America/Chicago with correct duration", () => {
    const { start, end } = getSlotStartEnd("2025-06-15", 14, 2, 0);
    assert.ok(start instanceof Date);
    assert.ok(end instanceof Date);
    const durationMs = end.getTime() - start.getTime();
    assert.strictEqual(durationMs, 2 * 60 * 60 * 1000);
  });

  it("produces a stable UTC instant on US spring-forward Sunday (America/Chicago)", () => {
    // 2025-03-09 is DST start (2am → 3am); 10:00 local after the transition is unambiguous.
    const { start } = getSlotStartEnd("2025-03-09", 10, 2, 0);
    assert.strictEqual(start.toISOString(), "2025-03-09T15:00:00.000Z");
  });

  it("round-trips with parseSlotId and buildSlotId", () => {
    const slotId = "2025-03-10-10-30-3";
    const parsed = parseSlotId(slotId);
    assert.ok(parsed);
    const rebuilt = buildSlotId(parsed!.dateStr, parsed!.startHour, parsed!.durationHours, parsed!.startMinute);
    assert.strictEqual(rebuilt, slotId);
    const { start, end } = getSlotStartEnd(parsed!.dateStr, parsed!.startHour, parsed!.durationHours, parsed!.startMinute);
    assert.ok(start.getTime() < end.getTime());
  });
});

describe("getDateStrInSlotTimezone", () => {
  it("keeps evening Chicago times on the same business date (UTC midnight edge)", () => {
    const chicagoEvening = new Date("2026-01-16T03:30:00.000Z"); // 2026-01-15 9:30 PM CST
    assert.strictEqual(getDateStrInSlotTimezone(chicagoEvening), "2026-01-15");
  });

  it("returns stable business dates across DST spring-forward boundary", () => {
    const beforeJump = new Date("2026-03-08T07:59:00.000Z"); // 1:59 AM CST
    const afterJump = new Date("2026-03-08T08:01:00.000Z"); // 3:01 AM CDT
    assert.strictEqual(getDateStrInSlotTimezone(beforeJump), "2026-03-08");
    assert.strictEqual(getDateStrInSlotTimezone(afterJump), "2026-03-08");
  });
});

describe("toDateStrOnly", () => {
  it("returns YYYY-MM-DD for valid date string", () => {
    assert.strictEqual(toDateStrOnly("2025-11-01"), "2025-11-01");
    assert.strictEqual(toDateStrOnly("2026-01-15"), "2026-01-15");
    assert.strictEqual(toDateStrOnly("2025-11-01T00:00:00.000Z"), "2025-11-01");
  });

  it("returns null for invalid or short input", () => {
    assert.strictEqual(toDateStrOnly(null), null);
    assert.strictEqual(toDateStrOnly(undefined), null);
    assert.strictEqual(toDateStrOnly(""), null);
    assert.strictEqual(toDateStrOnly("2025-11"), null);
    assert.strictEqual(toDateStrOnly("not-a-date"), null);
  });
});

describe("isSeasonalAllowed", () => {
  it("returns true when seasonal is disabled or undefined", () => {
    assert.strictEqual(isSeasonalAllowed(undefined, new Date("2025-06-15")), true);
    assert.strictEqual(isSeasonalAllowed({ enabled: false }, new Date("2025-06-15")), true);
  });

  it("allows slot when within date range (startDate/endDate)", () => {
    const seasonal = { enabled: true, startDate: "2025-06-01", endDate: "2025-08-31" };
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-06-15T12:00:00Z"), "2025-06-15"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-08-01T12:00:00Z"), "2025-08-01"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-05-31T12:00:00Z"), "2025-05-31"), false);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-09-01T12:00:00Z"), "2025-09-01"), false);
  });

  it("allows slot when within month range (startMonth/endMonth, no wrap)", () => {
    const seasonal = { enabled: true, startMonth: 6, endMonth: 8 };
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-06-15T12:00:00Z"), "2025-06-15"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-08-01T12:00:00Z"), "2025-08-01"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-05-31T12:00:00Z"), "2025-05-31"), false);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-09-01T12:00:00Z"), "2025-09-01"), false);
  });

  it("allows slot when within wrap-around month range (e.g. November through January)", () => {
    const seasonal = { enabled: true, startMonth: 11, endMonth: 1 };
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-11-15T12:00:00Z"), "2025-11-15"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-12-01T12:00:00Z"), "2025-12-01"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2026-01-10T12:00:00Z"), "2026-01-10"), true);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2025-10-31T12:00:00Z"), "2025-10-31"), false);
    assert.strictEqual(isSeasonalAllowed(seasonal, new Date("2026-02-01T12:00:00Z"), "2026-02-01"), false);
  });
});

describe("isWakeListingBoatType", () => {
  it("treats wake boatType case-insensitively and accepts common aliases", () => {
    assert.strictEqual(isWakeListingBoatType("wake"), true);
    assert.strictEqual(isWakeListingBoatType("Wake"), true);
    assert.strictEqual(isWakeListingBoatType(" WAKE "), true);
    assert.strictEqual(isWakeListingBoatType("wakeboard"), true);
    assert.strictEqual(isWakeListingBoatType("wakesurf"), true);
    assert.strictEqual(isWakeListingBoatType("pontoon"), false);
    assert.strictEqual(isWakeListingBoatType(undefined), false);
  });
});

describe("shouldUseWakeBoardCharterGrid", () => {
  it("watersports: blank boatType does not imply wake grid unless env fallback", () => {
    const prevPub = process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
    try {
      delete process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      assert.strictEqual(shouldUseWakeBoardCharterGrid(undefined, true), false);
      assert.strictEqual(shouldUseWakeBoardCharterGrid("", true), false);
      assert.strictEqual(shouldUseWakeBoardCharterGrid("wake", true), true);
      assert.strictEqual(shouldUseWakeBoardCharterGrid("pontoon", true), false);
      assert.strictEqual(shouldUseWakeBoardCharterGrid("", false), false);

      process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = "true";
      assert.strictEqual(shouldUseWakeBoardCharterGrid(undefined, true), false);
      assert.strictEqual(shouldUseWakeBoardCharterGrid("", true), false);
      process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = "true";
      assert.strictEqual(shouldUseWakeBoardCharterGrid(undefined, true), true);
      assert.strictEqual(shouldUseWakeBoardCharterGrid("", true), true);
    } finally {
      delete process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      if (prevPub === undefined) delete process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      else process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = prevPub;
    }
  });
});

describe("isListingBoatCharterStartTimeAllowed (wake grid vs checkout)", () => {
  const sat = "2025-06-14";
  const mon = "2025-06-09";

  it("fixture dates are Saturday / Monday in America/Chicago", () => {
    assert.strictEqual(isSaturdayInSlotTimezone(sat), true);
    assert.strictEqual(isSaturdayInSlotTimezone(mon), false);
  });

  it("wake boat: Saturday uses hourly grid when allowedStartTimes empty (same as pontoon)", () => {
    const boat = {
      boatType: "Wake",
      allowedStartTimes: [{ hour: 9, minute: 0 }, { hour: 9, minute: 30 }, { hour: 10, minute: 0 }, { hour: 10, minute: 30 }],
    };
    assert.strictEqual(
      isListingBoatCharterStartTimeAllowed(boat, sat, 15, 0, 4),
      false,
      "restricted boat list limits Saturday afternoon"
    );
    const boatHourly = { boatType: "Wake", allowedStartTimes: [] as { hour: number; minute: number }[] };
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boatHourly, sat, 15, 0, 4), true);
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boatHourly, sat, 12, 0, 3), true);
  });

  it("watersports listing + missing boatType: wake grid only when untyped fallback env is set", () => {
    const boatRestricted = {
      allowedStartTimes: [{ hour: 9, minute: 0 }, { hour: 9, minute: 30 }],
    };
    const boatHourly = { allowedStartTimes: [] as { hour: number; minute: number }[] };
    const prevPub = process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
    try {
      delete process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      assert.strictEqual(isListingBoatCharterStartTimeAllowed(boatRestricted, sat, 15, 0, 4, true), false);
      process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = "true";
      assert.strictEqual(isListingBoatCharterStartTimeAllowed(boatRestricted, sat, 15, 0, 4, true), false);
      process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = "true";
      assert.strictEqual(
        isListingBoatCharterStartTimeAllowed(boatRestricted, sat, 15, 0, 4, true),
        false,
        "restricted allowedStartTimes still apply on wake grid"
      );
      assert.strictEqual(isListingBoatCharterStartTimeAllowed(boatHourly, sat, 12, 0, 3, true), true);
      assert.strictEqual(isListingBoatCharterStartTimeAllowed(boatHourly, sat, 15, 0, 4, true), true);
      assert.strictEqual(
        isListingBoatCharterStartTimeAllowed(boatRestricted, sat, 9, 0, 4, false),
        true,
        "non-watersports path still honors boat allowedStartTimes"
      );
    } finally {
      delete process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      if (prevPub === undefined) delete process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      else process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = prevPub;
    }
  });

  it("wake boat: weekday restricts to allowedStartTimes when set", () => {
    const boat = {
      boatType: "wake" as const,
      allowedStartTimes: [{ hour: 9, minute: 0 }, { hour: 9, minute: 30 }],
    };
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boat, mon, 9, 0, 4), true);
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boat, mon, 15, 0, 4), false);
  });

  it("wake boat: weekday hourly when allowedStartTimes empty", () => {
    const boat = { boatType: "wake" as const, allowedStartTimes: [] as { hour: number; minute: number }[] };
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boat, mon, 15, 0, 3), true);
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boat, mon, 15, 30, 3), false);
  });

  it("non-wake listing boat still uses allowedStartTimes only", () => {
    const boat = {
      boatType: "pontoon",
      allowedStartTimes: [{ hour: 9, minute: 0 }],
    };
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boat, sat, 9, 0, 4), true);
    assert.strictEqual(isListingBoatCharterStartTimeAllowed(boat, sat, 15, 0, 4), false);
  });
});

describe("getSlotGridWakeBoard (hourly like pontoon)", () => {
  const sat = "2026-05-30";

  it("Saturday wake grid includes noon start for 3h charters", () => {
    const start = new Date(`${sat}T12:00:00.000Z`);
    const end = new Date(`${sat}T12:00:00.000Z`);
    const wakeGrid = getSlotGridWakeBoard(start, end, [3]);
    const pontoonGrid = getSlotGrid(start, end, [3]);
    assert.ok(
      wakeGrid.some((s) => s.dateStr === sat && s.startHour === 12 && s.startMinute === 0 && s.durationHours === 3),
      "wake grid should offer 12:00 PM 3h on Saturday"
    );
    assert.ok(
      pontoonGrid.some((s) => s.dateStr === sat && s.startHour === 12 && s.startMinute === 0 && s.durationHours === 3),
      "pontoon grid baseline"
    );
  });

  it("wake grid with boat allowedStartTimes matches restricted list only", () => {
    const start = new Date(`${sat}T12:00:00.000Z`);
    const end = new Date(`${sat}T12:00:00.000Z`);
    const restricted = getSlotGridWakeBoard(start, end, [3], [
      { hour: 9, minute: 0 },
      { hour: 10, minute: 30 },
    ]);
    assert.ok(restricted.some((s) => s.startHour === 9 && s.startMinute === 0));
    assert.ok(!restricted.some((s) => s.startHour === 12));
  });
});
