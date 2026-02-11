import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getStorageBucket } from "@/lib/booking/firebase-admin";
import { bookingEnv } from "@/lib/booking/env";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** POST /api/admin/upload — upload one image file. Body: multipart/form-data with "file". Returns { url }. */
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

  const rawPrefix = (formData.get("prefix") as string) || "boats/";
  const prefix = rawPrefix.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\/+/g, "/") || "boats/";
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
  const path = `${prefix}${crypto.randomUUID()}_${safeName}`;

  try {
    const bucket = getStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
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
