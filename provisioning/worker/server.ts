/**
 * Cloud Run entrypoint. Authenticates as the runtime service account via the metadata server.
 * Invoke: npx tsx provisioning/worker/server.ts
 */
import { createServer, type IncomingMessage } from "node:http";
import { handleProvisioningWorkerHttp } from "../../lib/provisioning/worker-http";

const PORT = Number(process.env.PORT || 8080);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const path = req.url || "/";
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(value) ? value[0] : value;
  }

  let body = "";
  try {
    if (method !== "GET" && method !== "HEAD") {
      body = await readBody(req);
    }
  } catch {
    res.writeHead(413, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, detail: "Request body too large" }));
    return;
  }

  const result = await handleProvisioningWorkerHttp({ method, path, body, headers });
  res.writeHead(result.status, { "content-type": "application/json" });
  res.end(JSON.stringify(result.body));
});

server.listen(PORT, () => {
  console.log(`slipstack-provisioner listening on ${PORT}`);
});
