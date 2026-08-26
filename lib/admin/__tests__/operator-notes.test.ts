import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  MAX_OPERATOR_NOTES_LOG,
  appendOperatorNote,
  pickOperatorNotesApiFields,
  readOperatorNotesLog,
  sanitizeOperatorNotes,
  operatorNoteAuthorFirstName,
  fromOperatorNoteAuthorLabel,
} from "../operator-notes";

describe("operator notes", () => {
  it("trims, normalizes newlines, and caps length", () => {
    assert.equal(sanitizeOperatorNotes("  dock north  "), "dock north");
    assert.equal(sanitizeOperatorNotes("a\r\nb"), "a\nb");
    assert.equal(sanitizeOperatorNotes(null), "");
    assert.equal(sanitizeOperatorNotes("x".repeat(MAX_OPERATOR_NOTES_LENGTH + 20)).length, MAX_OPERATOR_NOTES_LENGTH);
  });

  it("seeds a timeline from the legacy single note", () => {
    assert.deepEqual(
      readOperatorNotesLog({
        operatorNotes: "  Bring cooler  ",
        operatorNotesBy: " team@slipstack.io ",
        operatorNotesUpdatedAt: "2026-08-20T18:00:00.000Z",
      }),
      [
        {
          id: "legacy",
          text: "Bring cooler",
          by: "team@slipstack.io",
          at: "2026-08-20T18:00:00.000Z",
        },
      ]
    );
    assert.deepEqual(readOperatorNotesLog({}), []);
  });

  it("labels notes with the author’s first name instead of ops", () => {
    assert.equal(
      operatorNoteAuthorFirstName({ by: "team@slipstack.io" }),
      "Admin"
    );
    assert.equal(fromOperatorNoteAuthorLabel({ by: "team@slipstack.io" }), "From Admin");
    assert.equal(operatorNoteAuthorFirstName({ byName: "Alex Rivera", by: "alex@example.com" }), "Alex");
  });

  it("appends updates onto the existing timeline", () => {
    const first = readOperatorNotesLog({
      operatorNotes: "Dock north",
      operatorNotesBy: "va@example.com",
      operatorNotesUpdatedAt: "2026-08-20T17:00:00.000Z",
    });
    const next = appendOperatorNote(
      first,
      "  Guest running 10 min late  ",
      "team@slipstack.io",
      "2026-08-20T18:00:00.000Z",
      "note-2"
    );
    assert.equal(next.length, 2);
    assert.equal(next[0]!.text, "Dock north");
    assert.equal(next[1]!.text, "Guest running 10 min late");
    assert.equal(next[1]!.id, "note-2");
  });

  it("caps the timeline and exposes the latest note on the public fields", () => {
    let log = [] as ReturnType<typeof appendOperatorNote>;
    for (let i = 0; i < MAX_OPERATOR_NOTES_LOG + 5; i++) {
      log = appendOperatorNote(log, `Note ${i}`, "ops@example.com", `2026-08-20T18:00:${String(i).padStart(2, "0")}.000Z`, `n-${i}`);
    }
    assert.equal(log.length, MAX_OPERATOR_NOTES_LOG);
    assert.equal(log[0]!.text, "Note 5");
    const publicFields = pickOperatorNotesApiFields({ operatorNotesLog: log });
    assert.equal(publicFields.operatorNotes, `Note ${MAX_OPERATOR_NOTES_LOG + 4}`);
    assert.equal(publicFields.operatorNotesLog.length, MAX_OPERATOR_NOTES_LOG);
  });
});
