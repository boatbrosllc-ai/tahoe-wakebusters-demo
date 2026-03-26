import { NextResponse } from "next/server";

export async function POST() {
  // Tombstone route: keep a clear deprecation signal for in-flight legacy clients.
  return NextResponse.json(
    {
      error:
        "Direct checkout was removed. Use /api/booking/create-hold followed by /api/booking/create-checkout-session.",
      code: "direct_checkout_removed",
    },
    { status: 410 }
  );
}
