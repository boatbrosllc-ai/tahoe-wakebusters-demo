import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const cookieHeader = request.headers.get("cookie");
  const valid = await verifyAdminSessionCookie(cookieHeader);

  const isApiAdmin = pathname.startsWith("/api/admin");
  if (isApiAdmin) {
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Page request to /admin (non-API)
  if (!valid) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
