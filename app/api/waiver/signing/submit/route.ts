import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb, getStorageBucket, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
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
  appendWaiverSignedStoragePaths,
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
          {
            error:
              "This group link is invalid or has expired, or the maximum number of waiver signers for this booking has already been reached.",
          },
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
        return NextResponse.json({ error: "Signature must be a PNG, JPEG, or WebP image" }, { status: 400 });
      }
      if (signatureDataUrl.length > MAX_SIGNATURE_PAYLOAD_LENGTH) {
        return NextResponse.json({ error: "Signature payload too large" }, { status: 400 });
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

    const signedPayloadForFirestore: WaiverSignedPayload = { ...signedPayload };
    delete signedPayloadForFirestore.signatureDataUrl;

    const signed: WaiverSigned = {
      signedAt: now,
      ip,
      userAgent,
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

    const bucket = getStorageBucket();
    let pdfStoragePath: string | null = null;
    let htmlStoragePath: string | null = null;

    try {
      const htmlPath = `waivers/${requestIdForStorage}.html`;
      const htmlFile = bucket.file(htmlPath);
      await htmlFile.save(Buffer.from(html, "utf8"), {
        metadata: {
          contentType: "text/html; charset=utf-8",
          metadata: { requestId: requestIdForStorage, contentHash },
        },
      });
      htmlStoragePath = htmlPath;
    } catch (htmlErr) {
      const msg = htmlErr instanceof Error ? htmlErr.message : String(htmlErr);
      console.error("[waiver/submit] HTML storage failed", msg);
      await writeOperationalAlert({
        type: "waiver_signed_html_storage_failed",
        bookingId,
        requestId: requestIdForStorage,
        error: msg,
        source: "waiver-submit",
      });
    }

    try {
      const pdfBuffer = await generateWaiverPdf(html);
      const pdfPath = `waivers/${requestIdForStorage}.pdf`;
      const pdfFile = bucket.file(pdfPath);
      await pdfFile.save(pdfBuffer, {
        metadata: {
          contentType: "application/pdf",
          metadata: { requestId: requestIdForStorage, contentHash },
        },
      });
      pdfStoragePath = pdfPath;
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.warn("[waiver/submit] PDF generation failed (signed record stored; use HTML or regenerate)", msg);
      await writeOperationalAlert({
        type: "waiver_pdf_generation_failed",
        bookingId,
        requestId: requestIdForStorage,
        error: msg,
        source: "waiver-submit",
      });
    }

    if (pdfStoragePath != null || htmlStoragePath != null) {
      await appendWaiverSignedStoragePaths(requestIdForStorage, {
        pdfStoragePath,
        htmlStoragePath,
      });
    }

    try {
      const existing = await getBookingWaiverPointer(bookingId);
      if (isGroupSign) {
        await setBookingWaiverPointer(bookingId, {
          requestId: existing?.requestId ?? requestIdForStorage,
          status: "partial",
          templateId: existing?.templateId ?? templateId,
          templateVersion: existing?.templateVersion ?? templateVersion,
          signedCount: 1,
        });
      } else {
        await setBookingWaiverPointer(bookingId, {
          requestId: existing?.requestId ?? requestIdForStorage,
          status: "signed",
          templateId: existing?.templateId ?? templateId,
          templateVersion: existing?.templateVersion ?? templateVersion,
        });
      }
    } catch (pointerErr) {
      console.error("[waiver/submit] setBookingWaiverPointer failed (non-fatal)", pointerErr);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
