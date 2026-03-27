import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "app", "api", "admin");
const routeFiles = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name === "route.ts") routeFiles.push(full);
  }
}

walk(root);

const exportFnRegex = /export\s+async\s+function\s+(GET|POST|PATCH|DELETE|PUT)\s*\(/g;
const allowRegex = /(requireAdminSession|assertCronPostAuthorized|withAdminSession)/;
const offenders = [];

for (const file of routeFiles) {
  const raw = readFileSync(file, "utf8");
  if (!exportFnRegex.test(raw)) continue;
  const firstLines = raw.split(/\r?\n/).slice(0, 40).join("\n");
  if (!allowRegex.test(firstLines)) offenders.push(file);
}

if (offenders.length > 0) {
  console.error("Admin route guard check failed. Missing auth guard near top of file:");
  for (const f of offenders) console.error(` - ${f}`);
  process.exit(1);
}

console.log(`Admin route guard check passed for ${routeFiles.length} files.`);
