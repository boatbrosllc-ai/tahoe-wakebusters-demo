/** Add Netlify demo host to Firebase Auth authorized domains. */
const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");

function loadEnvLocal() {
  const raw = fs.readFileSync(".env.local", "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  const projectId = env.FIREBASE_PROJECT_ID;
  const domain = process.argv[2] || "tahoe-wakebusters-demo.netlify.app";
  const saPath = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH)
    ? env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH
    : path.join(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH);
  const auth = new GoogleAuth({
    keyFile: saPath,
    scopes: ["https://www.googleapis.com/auth/identitytoolkit", "https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const getRes = await client.request({ url });
  const config = getRes.data || {};
  const domains = new Set(config.authorizedDomains || []);
  if (domains.has(domain)) {
    console.log("Already authorized:", domain);
    return;
  }
  domains.add(domain);
  await client.request({
    url,
    method: "PATCH",
    params: { updateMask: "authorizedDomains" },
    data: { authorizedDomains: [...domains] },
  });
  console.log("Authorized domain added:", domain);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
