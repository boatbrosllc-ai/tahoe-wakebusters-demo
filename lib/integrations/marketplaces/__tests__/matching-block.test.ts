import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockIsExactSlotPlaceholder, blockNoteMatchesGuest, marketplaceBlockShouldConvert } from "../matching-block";

describe("blockNoteMatchesGuest", () => {
  it("matches first-name operator notes to marketplace guests", () => {
    assert.equal(blockNoteMatchesGuest("Paula", "Paula"), true);
    assert.equal(blockNoteMatchesGuest("Raquel", "Raquel Martinez"), true);
    assert.equal(blockNoteMatchesGuest("Timothy", "Timothy Mattox"), true);
    assert.equal(blockNoteMatchesGuest("Anna", "Anna"), true);
  });

  it("does not match empty notes, other guests, or operational labels", () => {
    assert.equal(blockNoteMatchesGuest(null, "Paula"), false);
    assert.equal(blockNoteMatchesGuest("Paula", ""), false);
    assert.equal(blockNoteMatchesGuest("Jessica", "Anna"), false);
    assert.equal(blockNoteMatchesGuest("John 3-7PM", "Timothy Mattox"), false);
    assert.equal(blockNoteMatchesGuest("Sunset cruise", "Jose Rico"), false);
    assert.equal(blockNoteMatchesGuest("Maintenance", "Paula"), false);
  });
});

describe("blockIsExactSlotPlaceholder", () => {
  const slotStart = new Date("2026-08-29T20:00:00.000Z");
  const slotEnd = new Date("2026-08-29T23:00:00.000Z");

  it("converts an unnamed same-boat block covering the same window", () => {
    assert.equal(
      blockIsExactSlotPlaceholder({
        note: null,
        blockStart: slotStart,
        blockEnd: slotEnd,
        slotStart,
        slotEnd,
        blockBoatId: "suntracker",
        targetBoatId: "suntracker",
      }),
      true
    );
  });

  it("does not convert named blocks, other boats, or different windows", () => {
    assert.equal(
      blockIsExactSlotPlaceholder({
        note: "Maintenance",
        blockStart: slotStart,
        blockEnd: slotEnd,
        slotStart,
        slotEnd,
        blockBoatId: "suntracker",
        targetBoatId: "suntracker",
      }),
      false
    );
    assert.equal(
      blockIsExactSlotPlaceholder({
        note: null,
        blockStart: slotStart,
        blockEnd: slotEnd,
        slotStart,
        slotEnd,
        blockBoatId: "neptoon",
        targetBoatId: "suntracker",
      }),
      false
    );
    assert.equal(
      blockIsExactSlotPlaceholder({
        note: null,
        blockStart: new Date("2026-08-29T14:00:00.000Z"),
        blockEnd: new Date("2026-08-29T16:00:00.000Z"),
        slotStart,
        slotEnd,
        blockBoatId: "suntracker",
        targetBoatId: "suntracker",
      }),
      false
    );
  });

  it("treats same-guest notes or exact unnamed placeholders as convertible", () => {
    assert.equal(
      marketplaceBlockShouldConvert({
        note: "Sean",
        guestName: "Sean",
        blockStart: slotStart,
        blockEnd: slotEnd,
        slotStart,
        slotEnd,
        blockBoatId: "neptoon",
        targetBoatId: "suntracker",
      }),
      true
    );
    assert.equal(
      marketplaceBlockShouldConvert({
        note: null,
        guestName: "Sean",
        blockStart: slotStart,
        blockEnd: slotEnd,
        slotStart,
        slotEnd,
        blockBoatId: "suntracker",
        targetBoatId: "suntracker",
      }),
      true
    );
  });
});
