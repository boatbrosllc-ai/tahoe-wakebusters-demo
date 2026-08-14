import { describe, it } from "node:test";
import assert from "node:assert";
import {
  PROVISIONING_SIGNATURE_HEADER,
  PROVISIONING_TIMESTAMP_HEADER,
} from "../constants";
import { signProvisioningWorkerRequest, verifyProvisioningWorkerRequest } from "../worker-hmac";
import { handleProvisioningWorkerHttp } from "../worker-http";
import { invokeProvisioningWorker } from "../worker-client";
import { runProvisioningJob } from "../jobs";
import { getProvisioningAuthClient } from "../google-auth";

const SECRET = "a".repeat(32);

describe("provisioning worker HMAC", () => {
  it("accepts a freshly signed request", () => {
    const body = JSON.stringify({ job: "health" });
    const headers = signProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      secret: SECRET,
      nowSec: 1_700_000_000,
      nonce: "abc",
    });
    const result = verifyProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      headers,
      secret: SECRET,
      nowSec: 1_700_000_000,
    });
    assert.deepStrictEqual(result, { ok: true });
  });

  it("rejects a tampered body", () => {
    const headers = signProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body: JSON.stringify({ job: "health" }),
      secret: SECRET,
      nowSec: 1_700_000_000,
    });
    const result = verifyProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body: JSON.stringify({ job: "create_customer_project" }),
      headers,
      secret: SECRET,
      nowSec: 1_700_000_000,
    });
    assert.strictEqual(result.ok, false);
  });

  it("rejects a stale timestamp", () => {
    const body = "{}";
    const headers = signProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      secret: SECRET,
      nowSec: 1_000,
    });
    const result = verifyProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      headers,
      secret: SECRET,
      nowSec: 1_000 + 10 * 60,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.match(result.error, /timestamp/);
  });

  it("rejects a wrong secret without leaking it", () => {
    const body = "{}";
    const headers = signProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      secret: SECRET,
      nowSec: 1_700_000_000,
    });
    const result = verifyProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      headers,
      secret: "b".repeat(32),
      nowSec: 1_700_000_000,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.doesNotMatch(result.error, /aaaaaaaa/);
      assert.doesNotMatch(result.error, new RegExp(headers[PROVISIONING_SIGNATURE_HEADER]));
    }
  });
});

describe("handleProvisioningWorkerHttp", () => {
  it("rejects unsigned job posts", async () => {
    const result = await handleProvisioningWorkerHttp({
      method: "POST",
      path: "/v1/jobs",
      body: JSON.stringify({ job: "health" }),
      headers: {},
      env: { PROVISIONING_WORKER_SECRET: SECRET, PROVISIONING_USE_MOCK: "1" },
    });
    assert.strictEqual(result.status, 401);
  });

  it("runs health with mock auth when signed", async () => {
    const body = JSON.stringify({ job: "health" });
    const headers = signProvisioningWorkerRequest({
      method: "POST",
      path: "/v1/jobs",
      body,
      secret: SECRET,
    });
    const result = await handleProvisioningWorkerHttp({
      method: "POST",
      path: "/v1/jobs",
      body,
      headers,
      env: {
        PROVISIONING_WORKER_SECRET: SECRET,
        PROVISIONING_USE_MOCK: "1",
        PROVISIONING_RUNTIME: "local",
      },
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.authMode, "mock");
    assert.ok(!JSON.stringify(result.body).includes("mock-provisioning-access-token"));
  });
});

describe("invokeProvisioningWorker / runProvisioningJob", () => {
  it("Netlify path signs and posts to the worker URL", async () => {
    const body = JSON.stringify({ job: "health" });
    let seenPath = "";
    let seenSig = "";
    const result = await invokeProvisioningWorker(
      { job: "health" },
      {
        NETLIFY: "true",
        PROVISIONING_WORKER_URL: "https://provisioner.example.run.app",
        PROVISIONING_WORKER_SECRET: SECRET,
      },
      async (url, init) => {
        seenPath = String(url);
        const headers = init?.headers as Record<string, string>;
        seenSig = headers[PROVISIONING_SIGNATURE_HEADER];
        assert.ok(headers[PROVISIONING_TIMESTAMP_HEADER]);
        assert.strictEqual(init?.body, body);
        return new Response(
          JSON.stringify({
            ok: true,
            job: "health",
            runtime: "cloudrun",
            authMode: "adc",
          }),
          { status: 200 }
        );
      }
    );
    assert.strictEqual(seenPath, "https://provisioner.example.run.app/v1/jobs");
    assert.ok(seenSig);
    assert.strictEqual(result.ok, true);
  });

  it("local mock runProvisioningJob does not call Google", async () => {
    const result = await runProvisioningJob(
      { job: "health" },
      { PROVISIONING_USE_MOCK: "1", PROVISIONING_RUNTIME: "local" }
    );
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.authMode, "mock");
  });

  it("refuses Google client construction on Netlify", async () => {
    await assert.rejects(
      () => getProvisioningAuthClient({ NETLIFY: "true", NODE_ENV: "production" }),
      /Cloud Run provisioner/
    );
  });

  it("refuses production JSON keys", async () => {
    await assert.rejects(
      () =>
        getProvisioningAuthClient({
          NETLIFY: "true",
          NODE_ENV: "production",
          GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON: '{"private_key":"-----BEGIN PRIVATE KEY-----"}',
        }),
      /non-production only/
    );
  });
});
