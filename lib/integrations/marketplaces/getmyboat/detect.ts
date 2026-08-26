import type { GmailMessageInput, ProviderDetection } from "../types";

export const GETMYBOAT_FROM_DOMAINS = ["getmyboat.com", "mail.getmyboat.com", "email.getmyboat.com"];

export function detectGetmyboat(input: GmailMessageInput): ProviderDetection | null {
  const from = `${input.fromEmail ?? ""} ${input.from ?? ""}`.toLowerCase();
  const subject = (input.subject ?? "").toLowerCase();
  const body = `${input.text ?? ""} ${input.html ?? ""}`.toLowerCase();
  const senderMatch = GETMYBOAT_FROM_DOMAINS.some((d) => from.includes(`@${d}`) || from.includes(d));
  const contentMatch =
    subject.includes("getmyboat") ||
    body.includes("getmyboat") ||
    /booking confirmed/.test(body) ||
    /just confirmed payment/.test(body) ||
    /getmyboat\.com\/inbox\//.test(body);
  if (senderMatch && contentMatch) return { provider: "getmyboat", reason: "sender_and_template" };
  if (senderMatch) return { provider: "getmyboat", reason: "sender" };
  if (/getmyboat booking/.test(subject) && contentMatch) {
    return { provider: "getmyboat", reason: "subject_and_template" };
  }
  return null;
}
