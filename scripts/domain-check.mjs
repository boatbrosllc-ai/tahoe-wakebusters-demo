import dns from "node:dns/promises";
import tls from "node:tls";
import https from "node:https";
import http from "node:http";

const INGEST =
  "http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624";

const HOST = "boatbrosatx.com";
const WWW = "www.boatbrosatx.com";
const NETLIFY_IPS = ["75.2.60.5", "99.83.190.102"];
const runId = "domain-migration-pre";

function now() {
  return Date.now();
}

function safeErr(err) {
  if (!err) return null;
  const e = err instanceof Error ? err : new Error(String(err));
  return { name: e.name, message: e.message };
}

async function fetchJson(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { ok: res.ok, status: res.status, text: text.slice(0, 2000), json };
}

function pemSummary(cert) {
  if (!cert) return null;
  // Node returns different shapes depending on version/flags.
  const subject = cert.subject ?? null;
  const issuer = cert.issuer ?? null;
  const subjectaltname = cert.subjectaltname ?? null;
  const valid_from = cert.valid_from ?? null;
  const valid_to = cert.valid_to ?? null;
  const fingerprint256 = cert.fingerprint256 ?? null;
  return { subject, issuer, subjectaltname, valid_from, valid_to, fingerprint256 };
}

function tlsProbe({ host, servername, port = 443 }) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername,
        ALPNProtocols: ["http/1.1"],
        rejectUnauthorized: false, // we want to capture cert even if invalid
      },
      () => {
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError ?? null;
        const cert = socket.getPeerCertificate?.() ?? null;
        const alpn = socket.alpnProtocol ?? null;
        socket.end();
        resolve({
          ok: true,
          authorized,
          authorizationError,
          alpn,
          cert: pemSummary(cert),
        });
      }
    );
    socket.setTimeout(8000);
    socket.on("timeout", () => {
      try {
        socket.destroy(new Error("TLS timeout"));
      } catch {
        // ignore
      }
    });
    socket.on("error", (err) => {
      resolve({ ok: false, error: safeErr(err) });
    });
  });
}

function head(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        method: "HEAD",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname || "/",
        timeout: 8000,
        headers: { Host: url.hostname, "User-Agent": "domain-check/1.0" },
      },
      (res) => {
        const headers = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k] = v;
        resolve({
          ok: true,
          statusCode: res.statusCode,
          headers,
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("HTTP timeout")));
    req.on("error", (err) => resolve({ ok: false, error: safeErr(err) }));
    req.end();
  });
}

async function main() {
  // H1: DNS mismatch / propagation issue
  // H2: Netlify has not provisioned TLS cert yet (wrong cert / no TLS on one IP)
  // H3: Host routing mismatch on Netlify edges (default cert / unreachable)
  // H4: Client-side connectivity issues (less likely if TLS fails from multiple probes)

  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      hypothesisId: "meta",
      location: "scripts/domain-check.mjs:main",
      message: "Starting domain diagnostics",
      data: { host: HOST, www: WWW, netlifyIps: NETLIFY_IPS },
      timestamp: now(),
    }),
  }).catch(() => {});
  // #endregion

  const dnsLocal = {};
  try {
    dnsLocal.a = await dns.resolve4(HOST);
  } catch (e) {
    dnsLocal.aErr = safeErr(e);
  }
  try {
    dnsLocal.aaaa = await dns.resolve6(HOST);
  } catch (e) {
    dnsLocal.aaaaErr = safeErr(e);
  }
  try {
    dnsLocal.wwwCname = await dns.resolveCname(WWW);
  } catch (e) {
    dnsLocal.wwwCnameErr = safeErr(e);
  }

  const dnsGoogleA = await fetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(HOST)}&type=A`
  ).catch((e) => ({ ok: false, error: safeErr(e) }));
  const dnsGoogleWww = await fetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(WWW)}&type=CNAME`
  ).catch((e) => ({ ok: false, error: safeErr(e) }));
  const dnsGoogleAAAA = await fetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(HOST)}&type=AAAA`
  ).catch((e) => ({ ok: false, error: safeErr(e) }));
  const dnsGoogleCAA = await fetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(HOST)}&type=CAA`
  ).catch((e) => ({ ok: false, error: safeErr(e) }));
  const dnsGoogleDS = await fetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(HOST)}&type=DS`
  ).catch((e) => ({ ok: false, error: safeErr(e) }));

  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      hypothesisId: "H1",
      location: "scripts/domain-check.mjs:DNS",
      message: "DNS answers (local + dns.google)",
      data: {
        local: dnsLocal,
        google: {
          a: dnsGoogleA?.json ?? dnsGoogleA,
          wwwCname: dnsGoogleWww?.json ?? dnsGoogleWww,
          aaaa: dnsGoogleAAAA?.json ?? dnsGoogleAAAA,
          caa: dnsGoogleCAA?.json ?? dnsGoogleCAA,
          ds: dnsGoogleDS?.json ?? dnsGoogleDS,
        },
      },
      timestamp: now(),
    }),
  }).catch(() => {});
  // #endregion

  const tlsHost = await tlsProbe({ host: HOST, servername: HOST });
  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      hypothesisId: "H2",
      location: "scripts/domain-check.mjs:TLS_HOST",
      message: "TLS probe to hostname (SNI=host)",
      data: tlsHost,
      timestamp: now(),
    }),
  }).catch(() => {});
  // #endregion

  const tlsByIp = {};
  for (const ip of NETLIFY_IPS) {
    tlsByIp[ip] = await tlsProbe({ host: ip, servername: HOST });
  }
  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      hypothesisId: "H3",
      location: "scripts/domain-check.mjs:TLS_IPS",
      message: "TLS probe to each Netlify IP (SNI=host)",
      data: tlsByIp,
      timestamp: now(),
    }),
  }).catch(() => {});
  // #endregion

  const httpHead = {
    http: await head(`http://${HOST}/`),
    https: await head(`https://${HOST}/`),
    wwwHttps: await head(`https://${WWW}/`),
  };
  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      hypothesisId: "H4",
      location: "scripts/domain-check.mjs:HTTP",
      message: "HTTP(S) HEAD results",
      data: httpHead,
      timestamp: now(),
    }),
  }).catch(() => {});
  // #endregion

  console.log("Diagnostics complete. Check .cursor/debug.log for results.");
}

main().catch((e) => {
  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      hypothesisId: "meta",
      location: "scripts/domain-check.mjs:top",
      message: "Diagnostics script crashed",
      data: { error: safeErr(e) },
      timestamp: now(),
    }),
  }).catch(() => {});
  // #endregion
  process.exitCode = 1;
});

