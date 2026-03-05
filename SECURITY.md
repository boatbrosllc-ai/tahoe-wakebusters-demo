# Security and secrets

## Secrets in `.env.local`

**Do not commit or share `.env.local`.** It may contain Firebase private keys, Stripe secret keys, Brevo API keys, and other secrets.

### If `.env.local` was ever committed or shared

1. **Rotate all secrets immediately:**
   - **Firebase:** Generate a new service account key in [Firebase Console → Project settings → Service accounts](https://console.firebase.google.com/), then revoke the old key.
   - **Stripe:** Roll the secret key in [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys).
   - **Brevo:** Delete and recreate the API key in Brevo → SMTP & API → API Keys.
   - **App secrets:** Regenerate `CRON_SECRET`, `SEED_SECRET`, and `MANAGE_BOOKING_SECRET` and set the new values in Netlify.

2. **Confirm `.env.local` was never committed:**  
   Run: `git log --all -- .env.local`  
   (Empty output = never committed.)

3. **Store new secrets only in Netlify:**  
   Use [Netlify → Site → Environment variables](https://docs.netlify.com/configure-builds/environment-variables/). Do not put production secrets in any file that could be pushed to a remote.

### Pre-commit hook

A pre-commit hook blocks commits that add or modify `.env.local` or other secret-bearing files (e.g. `*service*account*.json`, `*.pem`, `*.key`). Install with:

```bash
npm run prepare
```

This installs [husky](https://typicode.github.io/husky/) and registers the hook. Every commit will run it. To bypass in an emergency (not recommended): `git commit --no-verify`.

---

## Firestore indexes and legacy booking fallback

Required composite indexes for the booking APIs are defined in `firestore.indexes.json`. If they are not deployed, Firestore may use a slow legacy scan that can timeout or miss data.

1. **Deploy indexes:** From the project root:
   ```bash
   firebase deploy --only firestore:indexes --project boat-bros-app
   ```
2. **Confirm in Firebase Console:** Firestore → Indexes. Every index from `firestore.indexes.json` should show status **Enabled** (not Building — building can take several minutes).
3. **Disable legacy fallback in production:** In Netlify → Site → Environment variables, set `LEGACY_BOOKING_FALLBACK` to empty (unset) so the legacy scan path is never used in production.
