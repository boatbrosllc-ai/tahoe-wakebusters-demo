import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getStorageBucket, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { submitWaiverSigningSchema } from "@/lib/waiver/schema";
import {
  getTemplateById,
  getRequestById,
  allocateGroupSignerSlot,
  consumeTokenIfValid,
  updateRequestSigned,
  getBookingWaiverPointer,
  setBookingWaiverPointer,
} from "@/lib/waiver/firestore";
import { buildWaiverHtml } from "@/lib/waiver/waiver-html";
import { generateWaiverPdf } from "@/lib/waiver/pdf";
import type { WaiverSignedPayload, WaiverSigned } from "@/lib/waiver/types";

const MAX_SIGNATURE_PAYLOAD_LENGTH = 500_000; // ~500KB for data URL

export async function POST(request: NextRequest) {
  const rl = await checkRateLimit(getClientKey(request));
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitWaiverSigningSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = Object.values(first).flat().join(" ") || "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { token, groupToken, signer, initials, signatureDataUrl, typedName } = parsed.data;

  const allowedImagePrefixes = ["image/png", "image/jpeg", "image/webp"];
  const dataUrlPrefix = signatureDataUrl.slice(0, signatureDataUrl.indexOf(";"));
  const mime = dataUrlPrefix.startsWith("data:") ? dataUrlPrefix.slice(5) : "";
  if (!allowedImagePrefixes.includes(mime)) {
    return NextResponse.json(
      { error: "Signature must be a PNG, JPEG, or WebP image" },
      { status: 400 }
    );
  }

  if (signatureDataUrl.length > MAX_SIGNATURE_PAYLOAD_LENGTH) {
    return NextResponse.json(
      { error: "Signature payload too large" },
      { status: 400 }
    );
  }

  try {
    let req: (Awaited<ReturnType<typeof getRequestById>>) & { id: string };
    let isGroupSign = false;

    if (groupToken) {
      const allocated = await allocateGroupSignerSlot(groupToken);
      if (!allocated) {
        return NextResponse.json(
          { error: "This group link is invalid or has expired, or the maximum number of waiver signers for this booking has already been reached." },
          { status: 400 }
        );
      }
      req = allocated.request;
      isGroupSign = true;
    } else if (token) {
      const consumed = await consumeTokenIfValid(token);
      if (!consumed) {
        return NextResponse.json({ error: "This signing link has expired or already been used" }, { status: 400 });
      }
      req = consumed.request;
    } else {
      return NextResponse.json({ error: "Token or group link is required" }, { status: 400 });
    }

    const template = await getTemplateById(req.templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 500 });
    }

    const { Timestamp } = getFirestoreExports();
    const now = Timestamp.now();
    const nowIso = new Date().toISOString();

    const signedPayload: WaiverSignedPayload = {
      signerName: signer.name,
      signerEmail: signer.email,
      signerPhone: signer.phone ?? "",
      signerDob: signer.dob && signer.dob.trim() ? signer.dob.trim() : null,
      initials: initials ?? {},
      signatureDataUrl,
      typedName: typedName?.trim() || undefined,
    };

    const html = buildWaiverHtml({
      template: {
        title: template.title,
        termsHtml: template.termsHtml,
        clauses: template.clauses,
      },
      payload: signedPayload,
      signedAtIso: nowIso,
    });

    const contentHash = createHash("sha256").update(html, "utf8").digest("hex");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;

    let pdfUrl: string | null = null;
    let pdfStoragePath: string | null = null;

    try {
      const pdfBuffer = await generateWaiverPdf(html);
      const storagePath = `waivers/${req.id}.pdf`;
      const bucket = getStorageBucket();
      const file = bucket.file(storagePath);
      await file.save(pdfBuffer, {
        metadata: {
          contentType: "application/pdf",
          metadata: { requestId: req.id, contentHash },
        },
      });
      const pathSegments = storagePath.split("/").map((s) => encodeURIComponent(s)).join("/");
      pdfUrl = `https://storage.googleapis.com/${bucket.name}/${pathSegments}`;
      pdfStoragePath = storagePath;
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.warn("[waiver/submit] PDF generation skipped (waiver still marked signed)", msg);
    }

    const signedPayloadForFirestore: WaiverSignedPayload = { ...signedPayload };
    delete signedPayloadForFirestore.signatureDataUrl;

    const signed: WaiverSigned = {
      signedAt: now,
      ip,
      userAgent,
      ...(pdfUrl != null && { pdfUrl }),
      ...(pdfStoragePath != null && { pdfStoragePath }),
      contentHash,
      signedPayload: signedPayloadForFirestore,
    };

    await updateRequestSigned(req.id, signed);
    // Token was already consumed atomically in consumeTokenIfValid when using single-use token path
    // Update booking.waiver.status to "signed" for both primary link and group signers (so admin/customer see signed)
    const existing = await getBookingWaiverPointer(req.bookingId);
    await setBookingWaiverPointer(req.bookingId, {
      requestId: existing?.requestId ?? req.id,
      status: "signed",
      templateId: existing?.templateId ?? req.templateId,
      templateVersion: existing?.templateVersion ?? req.templateVersion,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
