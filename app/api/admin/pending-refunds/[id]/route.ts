import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

function parsePatchBody(body: unknown): { status: "resolved"; notes?: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.status !== "resolved") return null;
  const notes = typeof o.notes === "string" ? o.notes.trim() : undefined;
  return { status: "resolved", ...(notes ? { notes } : {}) };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = parsePatchBody(body);
  if (!input) {
    return NextResponse.json({ error: "Body must be { status: \"resolved\", notes?: string }" }, { status: 400 });
  }

  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const ref = db.collection("pendingRefunds").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = snap.data() as { status?: string };
    if (data.status === "resolved") {
      return NextResponse.json({ ok: true, id, alreadyResolved: true });
    }
    await ref.update({
      status: "resolved",
      resolvedAt: Timestamp.now(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
