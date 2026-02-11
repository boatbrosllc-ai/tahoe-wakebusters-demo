#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const nextExportsDir = path.join(projectRoot, "node_modules", "next", "dist", "server", "web", "exports");
const nextResponsePath = path.join(nextExportsDir, "next-response.js");

const nextResponseContent = [
  '"use strict";',
  "module.exports = require(\"../spec-extension/response\").NextResponse;",
  "",
].join("\n");

if (!fs.existsSync(nextExportsDir)) {
  process.exit(0);
}
fs.writeFileSync(nextResponsePath, nextResponseContent, "utf8");
console.log("[postinstall-next] Created next-response.js for Next.js API route build.");

const generateBuildIdPath = path.join(projectRoot, "node_modules", "next", "dist", "build", "generate-build-id.js");
if (fs.existsSync(generateBuildIdPath)) {
  let content = fs.readFileSync(generateBuildIdPath, "utf8");
  if (!content.includes('if (typeof generate !== "function")')) {
    content = content.replace(
      "async function generateBuildId(generate, fallback) {\n    let buildId = await generate();",
      'async function generateBuildId(generate, fallback) {\n    if (typeof generate !== "function") {\n        generate = fallback;\n    }\n    let buildId = await generate();'
    );
    fs.writeFileSync(generateBuildIdPath, content, "utf8");
    console.log("[postinstall-next] Patched generate-build-id.js for config loading.");
  }
}
