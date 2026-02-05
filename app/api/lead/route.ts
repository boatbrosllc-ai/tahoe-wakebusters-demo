import { NextRequest, NextResponse } from "next/server";

/**
 * Lead capture (email). Stores submissions temporarily; TODO: persist to DB/CMS.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const source = typeof body?.source === "string" ? body.source : "unknown";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    // TODO: Save to database or send to CRM/Mailchimp. For now log.
    // eslint-disable-next-line no-console
    console.log("[Lead]", { email, source, at: new Date().toISOString() });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
