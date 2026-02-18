import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getStorageBucket, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { submitWaiverSigningSchema } from "@/lib/waiver/schema";
import {
  getTokenById,
  getRequestById,
  getTemplateById,
  isTokenValid,
  updateRequestSigned,
  markTokenUsed,
  setBookingWaiverPointer,
} from "@/lib/waiver/firestore";
import { buildWaiverHtml } from "@/lib/waiver/waiver-html";
import { generateWaiverPdf } from "@/lib/waiver/pdf";
import type { WaiverSignedPayload, WaiverSigned } from "@/lib/waiver/types";

export async function POST(request: NextRequest) {
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

  const { token, signer, initials, signatureDataUrl, typedName } = parsed.data;

  try {
    const tokenDoc = await getTokenById(token);
    if (!tokenDoc) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }
    if (!isTokenValid(tokenDoc)) {
      return NextResponse.json({ error: "This signing link has expired or already been used" }, { status: 400 });
    }

    const req = await getRequestById(tokenDoc.waiverRequestId);
    if (!req || req.status !== "pending") {
      return NextResponse.json({ error: "Waiver request not found or no longer pending" }, { status: 400 });
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

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateWaiverPdf(html);
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.error("[waiver/submit] PDF generation failed", msg);
      return NextResponse.json(
        { error: "Could not generate PDF. Please try again or contact support." },
        { status: 500 }
      );
    }

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
    const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${pathSegments}`;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;

    const signed: WaiverSigned = {
      signedAt: now,
      ip,
      userAgent,
      pdfUrl,
      pdfStoragePath: storagePath,
      contentHash,
      signedPayload,
    };

    await updateRequestSigned(req.id, signed);
    await markTokenUsed(token);
    await setBookingWaiverPointer(req.bookingId, {
      requestId: req.id,
      status: "signed",
      templateId: req.templateId,
      templateVersion: req.templateVersion,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
