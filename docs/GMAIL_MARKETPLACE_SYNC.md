# Gmail marketplace sync

Inbox sync turns Boatsetter / GetMyBoat / Viator booking emails into operator calendar bookings. Read-only Gmail access only — nothing is written back to marketplaces.

## Setup overview

1. **OAuth client** — Create a Google Cloud OAuth client (`GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET`). Redirect URI: `{APP_BASE_URL}/api/integrations/gmail/oauth/callback`.
2. **Pub/Sub topic** — Create a topic for Gmail watch notifications (`GMAIL_WATCH_TOPIC`, e.g. `projects/YOUR_GCP_PROJECT/topics/gmail-marketplace-notifications`). Grant Gmail permission to publish to it.
3. **Push endpoint** — Point a Pub/Sub push subscription at `{APP_BASE_URL}/api/webhooks/gmail-pubsub`. Prefer OIDC verification with `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT`; optional shared token via `GMAIL_PUBSUB_PUSH_TOKEN`. Use `GMAIL_PUBSUB_SKIP_OIDC=1` only for local/dev.
4. **Token storage** — Set `GMAIL_TOKEN_ENCRYPTION_KEY` and `GMAIL_OAUTH_STATE_SECRET` (or fall back to admin/cron secrets). Optional bootstrap: `GMAIL_REFRESH_TOKEN`.

## Expected inbox

`GMAIL_ACCOUNT_EMAIL` is the inbox operators must connect (template/demo default: `team@slipstack.io`). Override per customer deployment. OAuth `login_hint`, watch state, and status checks all use this constant.

## Admin + cron

- **Admin → Integrations**: Connect Gmail, renew watch, and inspect marketplace events.
- **Renew-watch cron**: `POST /api/admin/cron/renew-gmail-watch` (auth via `CRON_SECRET`) calls `renewGmailWatchIfNeeded` so the Gmail users.watch lease does not expire.

See `.env.example` for the full env var list under “Marketplace Sync (Gmail)”.
