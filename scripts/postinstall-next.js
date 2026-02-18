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
    // Match "let buildId = await generate();" so we guard before calling generate (handles undefined config.generateBuildId)
    content = content.replace(
      /(\s+)let buildId = await generate\(\);/,
      "$1if (typeof generate !== \"function\") { generate = fallback; }\n$1let buildId = await generate();"
    );
    fs.writeFileSync(generateBuildIdPath, content, "utf8");
    console.log("[postinstall-next] Patched generate-build-id.js for config loading.");
  }
}
