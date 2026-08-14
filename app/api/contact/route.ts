import { NextRequest, NextResponse } from "next/server";
import { sendContactFormEmail } from "@/lib/booking/brevo";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";

const MAX_NAME_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 10_000;

/**
 * Contact form. Sends submission to CONTACT_EMAIL (or siteConfig contact email) via Brevo.
 * Rate-limited and input size capped to prevent abuse.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message required" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    await sendContactFormEmail(name, email, message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Contact] send failed", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
