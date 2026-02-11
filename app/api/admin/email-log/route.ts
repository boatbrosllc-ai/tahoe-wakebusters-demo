import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

function toIso(ts: { seconds?: number; toDate?: () => Date } | null): string | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof (ts as { seconds?: number }).seconds === "number")
    return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 500);
    const templateFilter = request.nextUrl.searchParams.get("templateId");

    let q = db.collection("emailLog").orderBy("sentAt", "desc").limit(limit);
    const snap = await q.get();
    let docs = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        to: data.to ?? "",
        toName: data.toName ?? null,
        templateId: data.templateId ?? "",
        subject: data.subject ?? "",
        bookingId: data.bookingId ?? null,
        sentAt: toIso(data.sentAt),
      };
    });
    if (templateFilter) docs = docs.filter((d) => d.templateId === templateFilter);
    return NextResponse.json(docs);
  } catch (err) {
    console.error("[admin/email-log]", err);
    return NextResponse.json({ error: "Failed to load email log" }, { status: 500 });
  }
}
