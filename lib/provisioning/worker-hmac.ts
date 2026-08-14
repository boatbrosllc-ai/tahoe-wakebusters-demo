import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  PROVISIONING_NONCE_HEADER,
  PROVISIONING_SIGNATURE_HEADER,
  PROVISIONING_TIMESTAMP_HEADER,
  PROVISIONING_TS_WINDOW_SEC,
} from "./constants";

export type SignedWorkerHeaders = {
  [PROVISIONING_TIMESTAMP_HEADER]: string;
  [PROVISIONING_NONCE_HEADER]: string;
  [PROVISIONING_SIGNATURE_HEADER]: string;
  "content-type": "application/json";
};

function canonicalize(method: string, path: string, timestamp: string, nonce: string, body: string): string {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function getProvisioningWorkerSecret(env: import("./runtime").ProvisioningEnv = process.env): string {
  const secret = env.PROVISIONING_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("PROVISIONING_WORKER_SECRET must be set to a 32+ character random value.");
  }
  return secret;
}

export function signProvisioningWorkerRequest(input: {
  method: string;
  path: string;
  body: string;
  secret: string;
  nowSec?: number;
  nonce?: string;
}): SignedWorkerHeaders {
  const timestamp = String(input.nowSec ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const signature = hmacHex(input.secret, canonicalize(input.method, input.path, timestamp, nonce, input.body));
  return {
    [PROVISIONING_TIMESTAMP_HEADER]: timestamp,
    [PROVISIONING_NONCE_HEADER]: nonce,
    [PROVISIONING_SIGNATURE_HEADER]: signature,
    "content-type": "application/json",
  };
}

export type WorkerAuthFailure = { ok: false; status: 401; error: string };
export type WorkerAuthSuccess = { ok: true };

export function verifyProvisioningWorkerRequest(input: {
  method: string;
  path: string;
  body: string;
  headers: Headers | Record<string, string | null | undefined>;
  secret: string;
  nowSec?: number;
}): WorkerAuthSuccess | WorkerAuthFailure {
  const read = (name: string): string => {
    if (typeof (input.headers as Headers).get === "function") {
      return (input.headers as Headers).get(name)?.trim() ?? "";
    }
    const rec = input.headers as Record<string, string | null | undefined>;
    return rec[name]?.trim() ?? rec[name.toLowerCase()]?.trim() ?? "";
  };

  const timestamp = read(PROVISIONING_TIMESTAMP_HEADER);
  const nonce = read(PROVISIONING_NONCE_HEADER);
  const signature = read(PROVISIONING_SIGNATURE_HEADER);
  if (!timestamp || !nonce || !signature) {
    return { ok: false, status: 401, error: "Missing provisioning signature headers" };
  }

  const tsSec = parseInt(timestamp, 10);
  if (!Number.isFinite(tsSec) || tsSec < 1) {
    return { ok: false, status: 401, error: "Invalid provisioning timestamp" };
  }
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsSec) > PROVISIONING_TS_WINDOW_SEC) {
    return { ok: false, status: 401, error: "Provisioning timestamp outside allowed window" };
  }

  const expected = hmacHex(input.secret, canonicalize(input.method, input.path, timestamp, nonce, input.body));
  if (!timingSafeHexEqual(signature, expected)) {
    return { ok: false, status: 401, error: "Invalid provisioning signature" };
  }
  return { ok: true };
}
