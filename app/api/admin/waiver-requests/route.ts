import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { listRequests } from "@/lib/waiver/firestore";
import { listWaiverRequestsQuerySchema } from "@/lib/waiver/schema";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const fromDate = request.nextUrl.searchParams.get("fromDate") ?? undefined;
  const toDate = request.nextUrl.searchParams.get("toDate") ?? undefined;
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");

  const parsed = listWaiverRequestsQuerySchema.safeParse({
    status,
    fromDate,
    toDate,
    search,
    limit: limitParam,
  });
  const filters = parsed.success ? parsed.data : { limit: 100 };

  try {
    const requests = await listRequests({
      status: filters.status,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      search: filters.search,
      limit: filters.limit,
    });
    return NextResponse.json({ requests });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
