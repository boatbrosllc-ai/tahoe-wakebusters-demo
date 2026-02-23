import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = getDb();
    await db.collection("blocks").doc(id).delete();
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/blocks DELETE]", err);
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
