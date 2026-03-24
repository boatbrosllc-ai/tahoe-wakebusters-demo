import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getStorageBucket } from "@/lib/booking/firebase-admin";
import { bookingEnv } from "@/lib/booking/env";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** POST /api/admin/upload — upload one image file. Body: multipart/form-data with "file". Returns { url }.
 * Uses Admin SDK (bypasses Storage rules). With root `storage.rules` denying all client access, public URLs
 * still depend on object/bucket ACL; audit exposure if you return permanent public URLs to the browser. */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Allowed types: JPEG, PNG, WebP, GIF" }, { status: 400 });
  }

  const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 413 });
  }

  const rawPrefix = (formData.get("prefix") as string) || "boats/";
  const prefix = rawPrefix.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\/+/g, "/") || "boats/";
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
  const path = `${prefix}${crypto.randomUUID()}_${safeName}`;

  try {
    const bucket = getStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    // Validate magic bytes match declared MIME to avoid trusting client-supplied type.
    const bytes = new Uint8Array(buffer);
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png =
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    const webp =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;
    const gif87a = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x37 && bytes[5] === 0x61;
    const gif89a = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x39 && bytes[5] === 0x61;
    const gif = gif87a || gif89a;
    const typeMatches =
      (file.type === "image/jpeg" && jpeg) ||
      (file.type === "image/png" && png) ||
      (file.type === "image/webp" && webp) ||
      (file.type === "image/gif" && gif);
    if (!typeMatches) {
      return NextResponse.json({ error: "File content does not match declared type" }, { status: 400 });
    }
    const dest = bucket.file(path);
    await dest.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { originalName: file.name },
      },
    });
    await dest.makePublic();
    // Use GCS path-style public URL so images load in browser (firebasestorage.googleapis.com can 403 for .firebasestorage.app buckets)
    const pathSegments = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const url = `https://storage.googleapis.com/${bucket.name}/${pathSegments}`;
    return NextResponse.json({ url, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isBucketNotFound = /bucket does not exist|notFound|bucket.*exist/i.test(message);
    const bucketUsed = bookingEnv.firebaseStorageBucket || (bookingEnv.firebaseProjectId ? `${bookingEnv.firebaseProjectId}.appspot.com` : "not set");
    const hint = isBucketNotFound
      ? `Bucket tried: "${bucketUsed}". In Firebase Console go to Build → Storage and copy the exact bucket name (e.g. boat-bros-app.appspot.com or boat-bros-app.firebasestorage.app), then set FIREBASE_STORAGE_BUCKET=that-name in .env.local and restart the dev server.`
      : /firebase|storage|credential/i.test(message)
        ? "Enable Firebase Storage in Console and ensure Storage bucket exists."
        : undefined;
    return NextResponse.json(
      { error: message, ...(hint && { hint }), ...(isBucketNotFound && { bucketTried: bucketUsed }) },
      { status: 503 }
    );
  }
}

/** GET /api/admin/upload?prefix=boats/ — list uploaded files (for file manager). Returns { files: { name, url }[] }. */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const prefix = request.nextUrl.searchParams.get("prefix") || "boats/";

  try {
    const bucket = getStorageBucket();
    const [files] = await bucket.getFiles({ prefix });
    const list = files.map((f: { name: string }) => {
      const pathSegments = f.name.split("/").map((s) => encodeURIComponent(s)).join("/");
      return { name: f.name, url: `https://storage.googleapis.com/${bucket.name}/${pathSegments}` };
    });
    return NextResponse.json({ files: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isBucketNotFound = /bucket does not exist|notFound|bucket.*exist/i.test(message);
    const bucketUsed = bookingEnv.firebaseStorageBucket || (bookingEnv.firebaseProjectId ? `${bookingEnv.firebaseProjectId}.appspot.com` : "not set");
    const hint = isBucketNotFound
      ? `Bucket tried: "${bucketUsed}". Set FIREBASE_STORAGE_BUCKET in .env.local to the exact bucket name from Firebase Console → Storage, then restart.`
      : /firebase|storage|bucket/i.test(message)
        ? FIREBASE_SETUP_HINT
        : undefined;
    return NextResponse.json(
      { error: message, ...(hint && { hint }), ...(isBucketNotFound && { bucketTried: bucketUsed }) },
      { status: 503 }
    );
  }
}
