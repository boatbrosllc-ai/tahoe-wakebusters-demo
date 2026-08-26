import type { GmailMessageInput, ProviderDetection } from "../types";

export const VIATOR_FROM_DOMAINS = ["t1.viator.com", "viator.com", "mail.viator.com"];

export function detectViator(input: GmailMessageInput): ProviderDetection | null {
  const from = `${input.fromEmail ?? ""} ${input.from ?? ""}`.toLowerCase();
  const subject = (input.subject ?? "").toLowerCase();
  const body = `${input.text ?? ""} ${input.html ?? ""}`.toLowerCase();
  const senderMatch =
    from.includes("booking@t1.viator.com") ||
    VIATOR_FROM_DOMAINS.some((d) => from.includes(`@${d}`));
  const contentMatch =
    /booking reference/.test(body) ||
    /#br-\d+/.test(subject) ||
    /new booking for/.test(subject) ||
    /product code/.test(body) ||
    /tour grade/.test(body);
  if (senderMatch && contentMatch) return { provider: "viator", reason: "sender_and_template" };
  if (senderMatch) return { provider: "viator", reason: "sender" };
  return null;
}
