type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

export type GmailPayloadLike = GmailPart & { headers?: GmailHeader[] };

function decodeBase64UrlToBuffer(data: string): Buffer {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  return Buffer.from(b64, "base64");
}

export function decodeBase64Url(data: string): string {
  return decodeBase64UrlToBuffer(data).toString("utf8");
}

function decodeQuotedPrintableBytes(input: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const byte = input[i]!;
    if (byte !== 0x3d) {
      out.push(byte);
      continue;
    }
    const next = input[i + 1];
    const next2 = input[i + 2];
    if (next === 0x0d && next2 === 0x0a) {
      i += 2;
      continue;
    }
    if (next === 0x0a) {
      i += 1;
      continue;
    }
    if (next !== undefined && next2 !== undefined) {
      const hex = String.fromCharCode(next, next2);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(byte);
  }
  return Buffer.from(out);
}

function partEncoding(part: GmailPart): string {
  const v = part.headers?.find((h) => h.name?.toLowerCase() === "content-transfer-encoding")?.value ?? "";
  return v.toLowerCase();
}

function decodePartBody(part: GmailPart): string {
  const data = part.body?.data;
  if (!data) return "";
  const raw = decodeBase64UrlToBuffer(data);
  if (partEncoding(part).includes("quoted-printable")) {
    return decodeQuotedPrintableBytes(raw).toString("utf8");
  }
  return raw.toString("utf8");
}

function walkParts(part: GmailPart | undefined, acc: { text: string[]; html: string[] }): void {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime.startsWith("multipart/") && part.parts?.length) {
    for (const child of part.parts) walkParts(child, acc);
    return;
  }
  if (mime === "text/plain") {
    const t = decodePartBody(part);
    if (t) acc.text.push(t);
    return;
  }
  if (mime === "text/html") {
    const t = decodePartBody(part);
    if (t) acc.html.push(t);
    return;
  }
  if (part.parts?.length) {
    for (const child of part.parts) walkParts(child, acc);
  }
}

export function extractGmailBodies(payload: GmailPayloadLike | undefined): { text: string; html: string } {
  const acc = { text: [] as string[], html: [] as string[] };
  walkParts(payload, acc);
  if (!acc.text.length && !acc.html.length && payload?.body?.data && payload.mimeType) {
    const decoded = decodePartBody(payload);
    if ((payload.mimeType ?? "").toLowerCase().includes("html")) acc.html.push(decoded);
    else acc.text.push(decoded);
  }
  return { text: acc.text.join("\n\n"), html: acc.html.join("\n\n") };
}

export function getGmailHeader(payload: GmailPayloadLike | undefined, name: string): string | undefined {
  const want = name.toLowerCase();
  const v = payload?.headers?.find((h) => (h.name ?? "").toLowerCase() === want)?.value;
  return v?.trim() || undefined;
}

export function extractEmailAddress(fromHeader?: string): string | undefined {
  if (!fromHeader) return undefined;
  const angle = fromHeader.match(/<([^>]+)>/);
  const raw = (angle?.[1] ?? fromHeader).trim().toLowerCase();
  return raw.includes("@") ? raw : undefined;
}

export function extractFromDomain(fromHeader?: string): string | undefined {
  const email = extractEmailAddress(fromHeader);
  if (!email) return undefined;
  return email.split("@")[1];
}
