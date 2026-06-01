import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseAdminTicketsBlockedInput,
  resolveTicketedAdminBlockImpactFromDocs,
  ticketedAvailableAfterAdminBlocks,
} from "../ticketed-admin-blocks";

function blockDoc(startMs: number, endMs: number, ticketsBlocked?: number) {
  return {
    data: () => ({
      startAt: { toDate: () => new Date(startMs) },
      endAt: { toDate: () => new Date(endMs) },
      ...(ticketsBlocked != null ? { ticketsBlocked } : {}),
    }),
  };
}

describe("ticketed-admin-blocks", () => {
  it("parseAdminTicketsBlockedInput accepts positive integers only", () => {
    assert.strictEqual(parseAdminTicketsBlockedInput(5), 5);
    assert.strictEqual(parseAdminTicketsBlockedInput("3"), 3);
    assert.strictEqual(parseAdminTicketsBlockedInput(undefined), undefined);
    assert.strictEqual(parseAdminTicketsBlockedInput(""), undefined);
    assert.strictEqual(parseAdminTicketsBlockedInput(0), null);
    assert.strictEqual(parseAdminTicketsBlockedInput(-1), null);
  });

  it("legacy block without ticketsBlocked fully blocks departure", () => {
    const slotStart = Date.parse("2030-07-15T19:00:00.000Z");
    const slotEnd = Date.parse("2030-07-15T20:00:00.000Z");
    const impact = resolveTicketedAdminBlockImpactFromDocs(
      [blockDoc(slotStart - 1000, slotEnd + 1000)],
      slotStart,
      slotEnd,
    );
    assert.strictEqual(impact.fullBlock, true);
    assert.strictEqual(impact.ticketsBlocked, 0);
    assert.strictEqual(ticketedAvailableAfterAdminBlocks(10, 2, 1, impact), 0);
  });

  it("partial blocks sum tickets held back", () => {
    const slotStart = Date.parse("2030-07-15T19:00:00.000Z");
    const slotEnd = Date.parse("2030-07-15T20:00:00.000Z");
    const impact = resolveTicketedAdminBlockImpactFromDocs(
      [blockDoc(slotStart - 1000, slotEnd + 1000, 3), blockDoc(slotStart, slotEnd, 2)],
      slotStart,
      slotEnd,
    );
    assert.strictEqual(impact.fullBlock, false);
    assert.strictEqual(impact.ticketsBlocked, 5);
    assert.strictEqual(ticketedAvailableAfterAdminBlocks(10, 2, 1, impact), 2);
  });

  it("full block wins over partial blocks on same departure", () => {
    const slotStart = Date.parse("2030-07-15T19:00:00.000Z");
    const slotEnd = Date.parse("2030-07-15T20:00:00.000Z");
    const impact = resolveTicketedAdminBlockImpactFromDocs(
      [blockDoc(slotStart, slotEnd, 4), blockDoc(slotStart, slotEnd)],
      slotStart,
      slotEnd,
    );
    assert.strictEqual(impact.fullBlock, true);
    assert.strictEqual(ticketedAvailableAfterAdminBlocks(10, 0, 0, impact), 0);
  });
});
