import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // #region agent log
  if (request.nextUrl.pathname === "/favicon.ico") {
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "middleware.ts:pathname",
        message: "favicon.ico requested",
        data: { pathname: request.nextUrl.pathname },
        timestamp: Date.now(),
        hypothesisId: "favicon-404",
      }),
    }).catch(() => {});
  }
  // #endregion
  return NextResponse.next();
}
