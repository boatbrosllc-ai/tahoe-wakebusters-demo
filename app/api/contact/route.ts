import { NextRequest, NextResponse } from "next/server";
import { sendContactFormEmail } from "@/lib/booking/brevo";

/**
 * Contact form. Sends submission to business email (boatbrosllc@gmail.com or CONTACT_EMAIL) via Brevo.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

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
