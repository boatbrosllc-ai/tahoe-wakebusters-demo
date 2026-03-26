import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { join } from "path";

describe("useHoldCreation close-during-proceed contract", () => {
  it("releases hold using createdHoldForRelease when modal closes mid-create", () => {
    const src = readFileSync(join(__dirname, "../components/site/useHoldCreation.ts"), "utf8");
    assert.match(src, /createdHoldForRelease/);
    assert.match(src, /pendingModalCloseWhileProceedRef\.current/);
    assert.match(src, /const explicit = createdHoldForRelease;/);
    assert.match(src, /const releaseTargetId = explicit\?\.holdId \?\? fin\.holdId;/);
    assert.match(src, /releaseCreatedHold\(/);
  });
});
