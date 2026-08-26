export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Expected connected inbox. Template/demo default: team@slipstack.io. Override per customer. */
export const GMAIL_ACCOUNT_EMAIL = (
  process.env.GMAIL_ACCOUNT_EMAIL?.trim() || "team@slipstack.io"
).toLowerCase();

/** Pub/Sub topic for Gmail watch — set GMAIL_WATCH_TOPIC per customer GCP project. */
export const GMAIL_WATCH_TOPIC =
  process.env.GMAIL_WATCH_TOPIC?.trim() ||
  "projects/YOUR_GCP_PROJECT/topics/gmail-marketplace-notifications";

export const GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT =
  process.env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT?.trim() ||
  "gmail-pubsub-push@YOUR_GCP_PROJECT.iam.gserviceaccount.com";

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";
export const GMAIL_INTEGRATION_COLLECTION = "gmailIntegration";
export const GMAIL_OAUTH_DOC = "oauth";
export const GMAIL_WATCH_DOC = "watch";
export const GMAIL_PROCESSED_COLLECTION = "gmailProcessedMessages";
export const GMAIL_RETRY_COLLECTION = "gmailMessageRetryQueue";
export const MARKETPLACE_EVENTS_COLLECTION = "marketplaceEvents";
export const MARKETPLACE_MAPS_COLLECTION = "marketplaceListingMaps";

export const MARKETPLACE_GMAIL_QUERIES = {
  boatsetter: "from:(boatsetter@mail.boatsetter.com)",
  viator: "from:(booking@t1.viator.com)",
  getmyboat: "from:(getmyboat.com)",
} as const;

export function gmailOauthRedirectUri(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/integrations/gmail/oauth/callback`;
}

export function gmailPubSubAudience(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/gmail-pubsub`;
}
