import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";

type Handler<TContext = unknown> = (request: NextRequest, context: TContext) => Promise<Response>;

export function withAdminSession<TContext = unknown>(handler: Handler<TContext>): Handler<TContext> {
  return async (request: NextRequest, context: TContext) => {
    const unauthorized = await requireAdminSession(request.headers.get("cookie"));
    if (unauthorized) return unauthorized;
    return handler(request, context);
  };
}

export function forbiddenJson(message: string): Response {
  return NextResponse.json({ error: message }, { status: 403 });
}
