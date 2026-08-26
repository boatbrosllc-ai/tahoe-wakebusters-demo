import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function encryptionKey(): Buffer {
  const explicit = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!explicit) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured");
  }
  const buf = Buffer.from(explicit, explicit.length === 64 ? "hex" : "utf8");
  if (buf.length >= 32) return buf.subarray(0, 32);
  return createHash("sha256").update(explicit).digest();
}

export function encryptSecret(plain: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(parts: { ciphertext: string; iv: string; tag: string }): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parts.tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
