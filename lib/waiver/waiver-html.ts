/**
 * Build final waiver HTML from template content + signer data + initials + signature.
 * Used for PDF generation and contentHash (sha256) for audit.
 */

import type { WaiverTemplate, WaiverClause, WaiverSignedPayload } from "./types";

export interface BuildWaiverHtmlInput {
  template: {
    title: string;
    termsHtml: string;
    clauses: WaiverClause[];
  };
  payload: WaiverSignedPayload;
  signedAtIso: string;
}

/**
 * Escape HTML for safe inclusion in document.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a single HTML document representing the signed waiver.
 * Includes terms, signer info, clause initials, and signature image.
 */
export function buildWaiverHtml(input: BuildWaiverHtmlInput): string {
  const { template, payload, signedAtIso } = input;
  const clausesSection =
    template.clauses.length > 0
      ? `
  <section style="margin-top:24px;">
    <h3 style="font-size:14px;margin-bottom:8px;">Acknowledgements</h3>
    <ul style="list-style:none;padding:0;">
      ${template.clauses
        .map(
          (c) =>
            `<li style="margin-bottom:8px;"><strong>${escapeHtml(c.label)}</strong> — Initials: ${escapeHtml(payload.initials[c.id] ?? "—")}</li>`
        )
        .join("")}
    </ul>
  </section>`
      : "";

  const signerSection = `
  <section style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
    <h3 style="font-size:14px;margin-bottom:8px;">Signer</h3>
    <p><strong>Name:</strong> ${escapeHtml(payload.signerName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.signerEmail)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(payload.signerPhone)}</p>
    ${payload.signerDob ? `<p><strong>Date of birth:</strong> ${escapeHtml(payload.signerDob)}</p>` : ""}
    <p><strong>Signed at:</strong> ${escapeHtml(signedAtIso)}</p>
  </section>`;

  const signatureSection = `
  <section style="margin-top:24px;">
    <h3 style="font-size:14px;margin-bottom:8px;">Signature</h3>
    ${payload.signatureDataUrl && payload.signatureDataUrl.startsWith("data:") ? `<img src="${payload.signatureDataUrl}" alt="Signature" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:4px;" />` : ""}
    ${payload.typedName ? `<p style="margin-top:8px;"><strong>Printed name:</strong> ${escapeHtml(payload.typedName)}</p>` : ""}
  </section>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(template.title)} – Signed Waiver</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
    .terms { white-space: pre-wrap; background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; }
    section { margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(template.title)}</h1>
  <p style="color:#666;font-size:14px;">This document was signed electronically on ${escapeHtml(signedAtIso)}.</p>

  <section>
    <h2 style="font-size:16px;">Terms and conditions</h2>
    <div class="terms">${template.termsHtml}</div>
  </section>
  ${clausesSection}
  ${signerSection}
  ${signatureSection}
</body>
</html>`;

  return html;
}
