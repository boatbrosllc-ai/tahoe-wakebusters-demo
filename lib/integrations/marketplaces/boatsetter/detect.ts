import type { GmailMessageInput, ProviderDetection } from "../types";

export const BOATSETTER_FROM_EMAIL = "boatsetter@mail.boatsetter.com";
export const BOATSETTER_FROM_DOMAIN = "mail.boatsetter.com";

export function detectBoatsetter(input: GmailMessageInput): ProviderDetection | null {
  const from = `${input.fromEmail ?? ""} ${input.from ?? ""}`.toLowerCase();
  const subject = (input.subject ?? "").toLowerCase();
  const body = `${input.text ?? ""} ${input.html ?? ""}`.toLowerCase();
  const senderMatch =
    from.includes(BOATSETTER_FROM_EMAIL) ||
    from.includes(`@${BOATSETTER_FROM_DOMAIN}`) ||
    /@mail\.boatsetter\.com\b/.test(from) ||
    /@boatsetter\.com\b/.test(from);
  const contentMatch =
    /boatsetter/.test(subject) ||
    /instant booking/.test(subject) ||
    /new booking/.test(subject) ||
    /booking confirmed/.test(subject) ||
    /prepare your boat for/.test(subject) ||
    /booking id/.test(body) ||
    /instant booking/.test(body) ||
    /canceled their booking/.test(body) ||
    /cancelled their booking/.test(body);
  if (senderMatch && contentMatch) {
    return { provider: "boatsetter", reason: "sender_and_template" };
  }
  if (senderMatch) {
    return { provider: "boatsetter", reason: "sender" };
  }
  return null;
}
