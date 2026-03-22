import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb, getStorageBucket, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import {
  submitWaiverSigningSchema,
  validateSignerRequiredFieldsForTemplate,
  validateSubmitSignatureForTemplate,
} from "@/lib/waiver/schema";
import {
  getTemplateById,
  getRequestById,
  getBookingWaiverPointer,
  setBookingWaiverPointer,
  getGroupTokenById,
  getTokenById,
  isTokenValid,
  commitSingleUseTokenWaiverSign,
  commitGroupTokenNewSignedRequest,
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

  try {
    let bookingId: string;
    let templateId: string;
    let templateVersion: number;
    let requestIdForStorage: string;
    let isGroupSign: boolean;

    if (groupToken) {
      const gt = await getGroupTokenById(groupToken);
      if (!gt) {
        return NextResponse.json(
          { error: "This group link is invalid or has expired, or the maximum number of waiver signers for this booking has already been reached." },
          { status: 400 }
        );
      }
      bookingId = gt.bookingId;
      templateId = gt.templateId;
      templateVersion = gt.templateVersion;
      const db = getDb();
      requestIdForStorage = db.collection("waiverRequests").doc().id;
      isGroupSign = true;
    } else if (token) {
      const tok = await getTokenById(token);
      if (!isTokenValid(tok)) {
        return NextResponse.json({ error: "This signing link has expired or already been used" }, { status: 400 });
      }
      const reqPreview = await getRequestById(tok!.waiverRequestId);
      if (!reqPreview || reqPreview.status !== "pending") {
        return NextResponse.json({ error: "This signing link has expired or already been used" }, { status: 400 });
      }
      bookingId = reqPreview.bookingId;
      templateId = reqPreview.templateId;
      templateVersion = reqPreview.templateVersion;
      requestIdForStorage = reqPreview.id;
      isGroupSign = false;
    } else {
      return NextResponse.json({ error: "Token or group link is required" }, { status: 400 });
    }

    const template = await getTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 500 });
    }

    const signerFields = validateSignerRequiredFieldsForTemplate(template, signer);
    if (!signerFields.ok) {
      return NextResponse.json({ error: signerFields.message }, { status: 400 });
    }

    const sigOk = validateSubmitSignatureForTemplate(template, { signatureDataUrl, typedName });
    if (!sigOk.ok) {
      return NextResponse.json({ error: sigOk.message }, { status: 400 });
    }

    if (signatureDataUrl) {
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
    }

    const { Timestamp } = getFirestoreExports();
    const now = Timestamp.now();
    const nowIso = new Date().toISOString();

    const signedPayload: WaiverSignedPayload = {
      signerName: signer.name,
      signerEmail: signer.email,
      signerPhone: signer.phone?.trim() ?? "",
      signerDob: signer.dob && signer.dob.trim() ? signer.dob.trim() : null,
      initials: initials ?? {},
      ...(signatureDataUrl ? { signatureDataUrl } : {}),
      typedName: typedName ?? undefined,
    };

    const html = buildWaiverHtml({
      template: {
        title: template.title,
        termsHtml: template.termsHtml,
        clauses: template.clauses,
        signatureMode: template.signature?.mode ?? "both",
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
      const storagePath = `waivers/${requestIdForStorage}.pdf`;
      const bucket = getStorageBucket();
      const file = bucket.file(storagePath);
      await file.save(pdfBuffer, {
        metadata: {
          contentType: "application/pdf",
          metadata: { requestId: requestIdForStorage, contentHash },
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

    const committed = isGroupSign
      ? await commitGroupTokenNewSignedRequest(groupToken!, requestIdForStorage, signed)
      : await commitSingleUseTokenWaiverSign(token!, signed);

    if (!committed) {
      return NextResponse.json(
        {
          error: isGroupSign
            ? "This group link is invalid or has expired, or the maximum number of waiver signers for this booking has already been reached."
            : "This signing link has expired or already been used",
        },
        { status: 400 }
      );
    }

    try {
      const existing = await getBookingWaiverPointer(bookingId);
      await setBookingWaiverPointer(bookingId, {
        requestId: existing?.requestId ?? requestIdForStorage,
        status: "signed",
        templateId: existing?.templateId ?? templateId,
        templateVersion: existing?.templateVersion ?? templateVersion,
      });
    } catch (pointerErr) {
      console.error("[waiver/submit] setBookingWaiverPointer failed (non-fatal)", pointerErr);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
