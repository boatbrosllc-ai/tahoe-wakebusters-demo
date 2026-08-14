#!/usr/bin/env node
/**
 * Import a Slipstack.io CustomerPlatformConfig launch packet into this customer repo.
 *
 * Usage:
 *   node --import tsx scripts/import-launch-packet.mjs path/to/launch-packet.json
 *   node --import tsx scripts/import-launch-packet.mjs path/to/launch-packet.json --dry-run
 *   node --import tsx scripts/import-launch-packet.mjs path/to/launch-packet.json --files-only
 *   node --import tsx scripts/import-launch-packet.mjs path/to/launch-packet.json --firebase-only
 *
 * Requires Firebase Admin env vars for Firestore seed (unless --files-only).
 * Loads .env.local when present.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

function installServerOnlyShim() {
  const Module = require("module");
  const shimPath = path.join(ROOT, "scripts", "shims", "server-only.js");
  fs.mkdirSync(path.dirname(shimPath), { recursive: true });
  if (!fs.existsSync(shimPath)) {
    fs.writeFileSync(shimPath, "module.exports = {};\n");
  }
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "server-only") return shimPath;
    return origResolve.call(this, request, parent, isMain, options);
  };
  return () => {
    Module._resolveFilename = origResolve;
  };
}

function usage() {
  console.log(`Usage: node --import tsx scripts/import-launch-packet.mjs <launch-packet.json> [options]

Options:
  --dry-run        Validate packet only (no writes)
  --files-only     Write config/site.ts + content/* only
  --firebase-only  Seed Firestore only (skip file writes)
  --help           Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) {
    usage();
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const packetPath = path.resolve(ROOT, args[0]);
  const dryRun = args.includes("--dry-run");
  const filesOnly = args.includes("--files-only");
  const firebaseOnly = args.includes("--firebase-only");

  if (!fs.existsSync(packetPath)) {
    console.error("Launch packet file not found:", packetPath);
    process.exit(1);
  }

  loadEnvLocal();
  const restoreResolve = installServerOnlyShim();

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(packetPath, "utf8"));
  } catch (err) {
    console.error("Invalid JSON:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const { importLaunchPacket } = await import("../lib/launch/import-launch-packet.ts");

  const result = await importLaunchPacket(raw, {
    rootDir: ROOT,
    dryRun,
    writeFiles: !firebaseOnly,
    seedFirebase: !filesOnly && !dryRun,
  });

  restoreResolve();

  if (!result.ok) {
    console.error("\nLaunch packet import failed:\n");
    for (const err of result.errors) console.error("  -", err);
    process.exit(1);
  }

  if (result.warnings.length) {
    console.warn("\nWarnings:");
    for (const w of result.warnings) console.warn("  -", w);
  }

  if (result.dryRun) {
    console.log("\nValidation OK for", result.config.company.name, `(${result.config.siteId})`);
    console.log("Dry run — no files written, no Firebase seed.");
    process.exit(0);
  }

  if (result.filesWritten?.length) {
    console.log("\nWrote config files:");
    for (const f of result.filesWritten) console.log("  -", path.relative(ROOT, f));
  }

  if (result.firebase) {
    console.log("\nFirestore seed complete:");
    console.log("  experiences:", result.firebase.experienceIds.length);
    console.log("  boats:", result.firebase.boatIds.length);
    if (result.firebase.waiverTemplateId) {
      console.log("  waiver template:", result.firebase.waiverTemplateId);
    }
    console.log("  blackout blocks:", result.firebase.blackoutBlocks);
  }

  console.log("\nImport complete for", result.config.company.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
