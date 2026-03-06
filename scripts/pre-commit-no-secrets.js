#!/usr/bin/env node
/**
 * Pre-commit hook: block staging of files that may contain secrets; run lint and booking tests.
 * Run via: husky .husky/pre-commit -> node scripts/pre-commit-no-secrets.js
 */
const { execSync } = require("child_process");
const staged = execSync("git diff --cached --name-only", { encoding: "utf8" })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const blocked = [".env.local"];
const blockedPatterns = [/service.?account.*\.json$/i, /\.pem$/i, /\.key$/i];
const allowlist = ["package.json", "package-lock.json", "tsconfig", ".config."];

for (const f of staged) {
  if (blocked.some((b) => f === b || f.endsWith(b))) {
    console.error(`ERROR: Refusing to commit ${f} (may contain secrets).`);
    console.error("Remove from commit: git reset HEAD --", f);
    process.exit(1);
  }
  const base = require("path").basename(f);
  for (const re of blockedPatterns) {
    if (re.test(f) && !allowlist.some((a) => base.includes(a))) {
      console.error(`ERROR: Refusing to commit possible secret file: ${f}`);
      process.exit(1);
    }
  }
}

try {
  execSync("npm run lint", { stdio: "inherit" });
} catch {
  console.error("Pre-commit: lint failed. Fix errors and try again.");
  process.exit(1);
}

try {
  execSync("npm run test:booking", { stdio: "inherit" });
} catch {
  console.error("Pre-commit: booking tests failed. Fix tests and try again.");
  process.exit(1);
}

process.exit(0);
