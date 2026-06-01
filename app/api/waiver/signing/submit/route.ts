import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb, getStorageBucket, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import {
  submitWaiverSigningSchema,
  validateSignerRequiredFieldsForTemplate,
  validateTermsAcceptanceForTemplate,
  validateRequiredClauseInitialsForTemplate,
  validateDobPolicyForTemplate,
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
  flagWaiverRequestForManualReview,
  commitSingleUseTokenWaiverSign,
  commitGroupTokenNewSignedRequest,
  commitQrLinkSignedRequest,
} from "@/lib/waiver/firestore";
import { getWaiverQrLinkById } from "@/lib/waiver/waiver-qr-firestore";
import { buildWaiverHtml } from "@/lib/waiver/waiver-html";
import { generateWaiverPdf } from "@/lib/waiver/pdf";
import { uploadWaiverSignatureDataUrl } from "@/lib/waiver/upload-signature-to-storage";
import type { WaiverSignedPayload, WaiverSigned, WaiverTemplateSnapshot } from "@/lib/waiver/types";

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

  const signerIdentityStrictMode = process.env.WAIVER_SIGNER_IDENTITY_STRICT?.trim().toLowerCase() !== "false";

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

  const {
    token,
    groupToken,
    qrLinkId: qrLinkIdRaw,
    signer,
    initials,
    signatureDataUrl,
    typedName,
    termsAccepted,
    termsAcceptedAtIso,
    termsContentHash,
  } = parsed.data;

  try {
    let bookingId: string;
    let templateId: string;
    let templateVersion: number;
    let templateSnapshot: WaiverTemplateSnapshot | undefined;
    let expectedSignerEmail: string | undefined;
    let manualReviewCandidate:
      | {
          reasonCode: string;
          reason: string;
          metadata?: Record<string, unknown>;
        }
      | undefined;
    let normalizedDob: string | null | undefined;
    let requestIdForStorage: string;
    let isGroupSign: boolean;
    let isQrSign = false;

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
        templateSnapshot = gt.templateSnapshot;
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
        templateSnapshot = reqPreview.templateSnapshot;
        expectedSignerEmail = tok?.signerEmail ?? reqPreview.signerEmail;
      requestIdForStorage = reqPreview.id;
      isGroupSign = false;
    } else if ((qrLinkIdRaw ?? "").trim()) {
      const qrId = qrLinkIdRaw!.trim();
      const link = await getWaiverQrLinkById(qrId);
      if (!link?.active) {
        return NextResponse.json({ error: "This QR link is not active. Ask staff for a current code." }, { status: 400 });
      }
      const db = getDb();
      requestIdForStorage = db.collection("waiverRequests").doc().id;
      bookingId = `walkin-${requestIdForStorage}`;
      templateId = link.templateId;
      const tmplLive = await getTemplateById(templateId);
      if (!tmplLive?.isActive) {
        return NextResponse.json(
          { error: "This waiver is not accepting signatures right now. Please ask staff for assistance." },
          { status: 403 }
        );
      }
      templateVersion = tmplLive.version;
      templateSnapshot = undefined;
      isGroupSign = false;
      isQrSign = true;
    } else {
      return NextResponse.json({ error: "Token, group link, or QR link is required" }, { status: 400 });
    }

      const template =
        templateSnapshot ??
        (await (async () => {
          const resolved = await getTemplateById(templateId);
          if (!resolved) return null;
          // Hard mismatch check for legacy requests that did not persist a pinned template snapshot.
          if (resolved.version !== templateVersion) return null;
          return resolved;
        })());

      if (!template) {
        const requestIdToFlag = isGroupSign || isQrSign ? null : requestIdForStorage;
        if (requestIdToFlag) {
          await flagWaiverRequestForManualReview(requestIdToFlag, {
            reasonCode: "waiver_template_version_mismatch",
            reason: "Pinned template snapshot missing or mismatched against request.templateVersion; signing rejected for manual legal review.",
          });
        }
        return NextResponse.json({ error: "Waiver template version mismatch; please contact support." }, { status: 409 });
      }

      // If we had a pinned snapshot but its version disagrees, reject hard.
      if (templateSnapshot && templateSnapshot.version !== templateVersion) {
        if (!isGroupSign) {
          await flagWaiverRequestForManualReview(requestIdForStorage, {
            reasonCode: "waiver_template_version_mismatch",
            reason: `Pinned template snapshot version (${templateSnapshot.version}) differs from request.templateVersion (${templateVersion}).`,
          });
        }
        return NextResponse.json({ error: "Waiver template version mismatch; please contact support." }, { status: 409 });
      }

      if (!isGroupSign && !isQrSign && expectedSignerEmail) {
        const submitted = signer.email.trim().toLowerCase();
        const expected = expectedSignerEmail.trim().toLowerCase();
        if (submitted !== expected) {
          if (signerIdentityStrictMode) {
            return NextResponse.json({ error: "Signer identity does not match the signing token." }, { status: 403 });
          }
          manualReviewCandidate = {
            reasonCode: "waiver_signer_identity_mismatch",
            reason: "Submitted signer identity does not match the signing token; manual review required.",
            metadata: { expectedSignerEmail: expected, submittedSignerEmail: submitted },
          };
          await writeOperationalAlert({
            type: "waiver_signer_identity_mismatch_manual_review",
            bookingId,
            requestId: requestIdForStorage,
            source: "waiver-submit",
            expectedSignerEmail: expected,
            submittedSignerEmail: submitted,
          });
        }
      }

    const termsOk = validateTermsAcceptanceForTemplate(template, {
      termsAccepted,
      termsAcceptedAtIso,
      termsContentHash,
    });
    if (!termsOk.ok) {
      return NextResponse.json({ error: termsOk.message }, { status: 400 });
    }

    const initialsOk = validateRequiredClauseInitialsForTemplate(template, initials);
    if (!initialsOk.ok) {
      return NextResponse.json({ error: initialsOk.message }, { status: 400 });
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

    const dobPolicy = validateDobPolicyForTemplate(template, { dob: signer.dob });
    if (!dobPolicy.ok) {
      return NextResponse.json({ error: dobPolicy.message }, { status: 400 });
    }

    normalizedDob = dobPolicy.normalizedDob;
    if (dobPolicy.manualReview) {
      if (!manualReviewCandidate) {
        manualReviewCandidate = dobPolicy.manualReview;
      } else {
        // Combine multiple independent manual-review triggers into a single request flag.
        manualReviewCandidate = {
          reasonCode: "waiver_multiple_manual_review_reasons",
          reason: `${manualReviewCandidate.reason}; ${dobPolicy.manualReview.reason}`,
          metadata: { ...(manualReviewCandidate.metadata ?? {}), ...(dobPolicy.manualReview.metadata ?? {}) },
        };
      }
    }

    const { Timestamp } = getFirestoreExports();
    const now = Timestamp.now();
    const nowIso = new Date().toISOString();

    const signedPayload: WaiverSignedPayload = {
      signerName: signer.name,
      signerEmail: signer.email,
      signerPhone: signer.phone?.trim() ?? "",
      signerAddress: signer.address?.trim() || null,
      bookingDate: signer.bookingDate?.trim() || null,
      signerDob: normalizedDob ?? null,
      initials: initials ?? {},
      termsAcceptedAtIso,
      termsContentHash,
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

    const bucket = getStorageBucket();

    let signatureStoragePath: string | null = null;
    try {
      signatureStoragePath = await uploadWaiverSignatureDataUrl(
        bucket,
        requestIdForStorage,
        signedPayload.signatureDataUrl
      );
    } catch (sigErr) {
      const msg = sigErr instanceof Error ? sigErr.message : String(sigErr);
      console.warn("[waiver/submit] signature image storage failed (typed name only in admin)", msg);
    }

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

    if (pdfStoragePath == null && htmlStoragePath == null) {
      return NextResponse.json(
        { error: "Waiver document storage failed. Please retry." },
        { status: 503 }
      );
    }

    const templateSnapshotToPersist: WaiverTemplateSnapshot = ((t: unknown) => {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = t as Record<string, unknown>;
      return rest as WaiverTemplateSnapshot;
    })(template);

    const signed: WaiverSigned = {
      signedAt: now,
      ip,
      userAgent,
      contentHash,
      pdfStoragePath,
      htmlStoragePath,
      ...(signatureStoragePath ? { signatureStoragePath } : {}),
      signedPayload: signedPayloadForFirestore,
      ...(manualReviewCandidate ? { requiresManualReview: { ...manualReviewCandidate, at: now } } : {}),
    };

    if (isQrSign) {
      await commitQrLinkSignedRequest({
        requestId: requestIdForStorage,
        qrLinkId: qrLinkIdRaw!.trim(),
        bookingId,
        templateId,
        templateVersion,
        templateSnapshot: templateSnapshotToPersist,
        signed,
      });
    } else {
      const committed = isGroupSign
        ? await commitGroupTokenNewSignedRequest(groupToken!, requestIdForStorage, signed, templateSnapshotToPersist)
        : await commitSingleUseTokenWaiverSign(token!, signed, templateSnapshotToPersist);
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
    }

    try {
      if (!bookingId.startsWith("walkin-")) {
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
