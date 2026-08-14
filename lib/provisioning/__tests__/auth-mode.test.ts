import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveProvisioningAuth } from "../auth-mode";
import { detectProvisioningRuntime } from "../runtime";
import { SLIPSTACK_PROVISIONER_SA_EMAIL } from "../constants";

const KEYS = [
  "NETLIFY",
  "NETLIFY_DEV",
  "K_SERVICE",
  "NODE_ENV",
  "PROVISIONING_RUNTIME",
  "PROVISIONING_USE_MOCK",
  "GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON_B64",
  "GOOGLE_PROVISIONING_IMPERSONATE_SA",
  "ALLOW_DEPRECATED_PROVISIONING_SA_JSON",
  "GOOGLE_PROVISIONING_SERVICE_ACCOUNT_EMAIL",
] as const;

function isolate(env: Record<string, string | undefined>) {
  const merged: Record<string, string | undefined> = { ...process.env };
  for (const key of KEYS) {
    delete merged[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

describe("detectProvisioningRuntime", () => {
  it("detects Netlify from NETLIFY=true", () => {
    assert.strictEqual(detectProvisioningRuntime(isolate({ NETLIFY: "true" })), "netlify");
  });

  it("detects Cloud Run from K_SERVICE", () => {
    assert.strictEqual(detectProvisioningRuntime(isolate({ K_SERVICE: "slipstack-provisioner" })), "cloudrun");
  });

  it("defaults to local", () => {
    assert.strictEqual(detectProvisioningRuntime(isolate({})), "local");
  });
});

describe("resolveProvisioningAuth", () => {
  it("uses worker mode on Netlify and never selects JSON keys", () => {
    const decision = resolveProvisioningAuth(
      isolate({
        NETLIFY: "true",
        NODE_ENV: "production",
        GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON: '{"private_key":"x"}',
      })
    );
    assert.strictEqual(decision.mode, "worker");
    assert.ok(decision.jsonKeyBlockedReason);
    assert.strictEqual(decision.serviceAccountEmail, SLIPSTACK_PROVISIONER_SA_EMAIL);
  });

  it("uses ADC on Cloud Run", () => {
    const decision = resolveProvisioningAuth(isolate({ K_SERVICE: "slipstack-provisioner" }));
    assert.strictEqual(decision.mode, "adc");
    assert.strictEqual(decision.runtime, "cloudrun");
  });

  it("uses impersonation when GOOGLE_PROVISIONING_IMPERSONATE_SA is set", () => {
    const sa = SLIPSTACK_PROVISIONER_SA_EMAIL;
    const decision = resolveProvisioningAuth(isolate({ GOOGLE_PROVISIONING_IMPERSONATE_SA: sa }));
    assert.strictEqual(decision.mode, "impersonate");
    assert.strictEqual(decision.impersonateServiceAccount, sa);
  });

  it("allows mock only on local", () => {
    const decision = resolveProvisioningAuth(isolate({ PROVISIONING_USE_MOCK: "1" }));
    assert.strictEqual(decision.mode, "mock");
    assert.throws(
      () => resolveProvisioningAuth(isolate({ NETLIFY: "true", PROVISIONING_USE_MOCK: "1" })),
      /not allowed on Netlify/
    );
  });

  it("allows deprecated JSON only with explicit local opt-in", () => {
    const blocked = resolveProvisioningAuth(
      isolate({
        NODE_ENV: "production",
        GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON: "{}",
      })
    );
    assert.ok(blocked.jsonKeyBlockedReason);

    const allowed = resolveProvisioningAuth(
      isolate({
        ALLOW_DEPRECATED_PROVISIONING_SA_JSON: "1",
        GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON: "{}",
      })
    );
    assert.strictEqual(allowed.mode, "deprecated_json");
  });
});
