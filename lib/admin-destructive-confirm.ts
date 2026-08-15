import { NextResponse } from "next/server";

/**
 * Destructive admin tools (seed / backfill apply) require an explicit confirm phrase
 * matching BACKFILL_CONFIRM_PHRASE or SEED_CONFIRM_PHRASE.
 */
export function requireDestructiveConfirmPhrase(
  confirmPhrase: unknown
): NextResponse | null {
  const required =
    process.env.BACKFILL_CONFIRM_PHRASE?.trim() ||
    process.env.SEED_CONFIRM_PHRASE?.trim();
  const provided = typeof confirmPhrase === "string" ? confirmPhrase.trim() : "";
  if (!required || provided !== required) {
    return NextResponse.json(
      {
        error:
          "This action requires body.confirmPhrase matching BACKFILL_CONFIRM_PHRASE (or SEED_CONFIRM_PHRASE).",
      },
      { status: 403 }
    );
  }
  return null;
}

export function requireSeedConfirmPhrase(confirmPhrase: unknown): NextResponse | null {
  const required = process.env.SEED_CONFIRM_PHRASE?.trim();
  const provided = typeof confirmPhrase === "string" ? confirmPhrase.trim() : "";
  if (!required || provided !== required) {
    return NextResponse.json(
      {
        error:
          "Seed requires body.confirmPhrase matching SEED_CONFIRM_PHRASE. This tool can overwrite live catalog data.",
      },
      { status: 403 }
    );
  }
  return null;
}
