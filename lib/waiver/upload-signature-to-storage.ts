import "server-only";

import { getStorageBucket } from "@/lib/booking/firebase-admin";

type GcsBucket = ReturnType<typeof getStorageBucket>;

const MAX_BYTES = 600_000;

/**
 * Persist a data-URL signature image to Firebase Storage; returns object path or null.
 */
export async function uploadWaiverSignatureDataUrl(
  bucket: GcsBucket,
  requestId: string,
  dataUrl: string | undefined
): Promise<string | null> {
  if (!dataUrl?.startsWith("data:")) return null;
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].trim().toLowerCase();
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(mime)) return null;
  const buf = Buffer.from(match[2], "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;

  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const path = `waivers/${requestId}-signature.${ext}`;
  await bucket.file(path).save(buf, {
    metadata: {
      contentType: mime,
      metadata: { requestId, kind: "waiver-signature" },
    },
  });
  return path;
}
