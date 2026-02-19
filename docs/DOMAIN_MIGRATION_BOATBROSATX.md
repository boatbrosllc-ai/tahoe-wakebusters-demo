# Domain migration to boatbrosatx.com

Use this checklist when switching to (or going live on) **boatbrosatx.com** so redirects, payments, auth, and SEO keep working.

---

## 1. App / hosting (Vercel or other)

- [ ] **Add custom domain**  
  In your host (e.g. Vercel → Project → Settings → Domains), add `boatbrosatx.com` and `www.boatbrosatx.com` if you use www. Point DNS as instructed (A/CNAME).

- [ ] **Environment variables** (production)  
  Set these for the production environment:
  - `NEXT_PUBLIC_SITE_URL` = `https://boatbrosatx.com`  
    (used for canonicals, sitemap, Open Graph; code fallback is already this.)
  - `APP_BASE_URL` = `https://boatbrosatx.com`  
    (used for Stripe success/cancel URLs, waiver links, and other server-generated links. **No trailing slash.**)

  Redeploy after changing env vars.

---

## 2. Stripe

- [ ] **Webhook endpoint**  
  Stripe Dashboard → [Developers → Webhooks](https://dashboard.stripe.com/webhooks):
  - Add endpoint: `https://boatbrosatx.com/api/stripe/webhook`
  - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
  - Copy the **Signing secret** and set it in your host as `STRIPE_WEBHOOK_SECRET` (for the new endpoint).

- [ ] **Success/cancel URLs**  
  They are built in code from `APP_BASE_URL`:
  - Success: `{APP_BASE_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`
  - Cancel: `{APP_BASE_URL}/booking/cancel?holdId=...`  
  So once `APP_BASE_URL` is `https://boatbrosatx.com`, no Stripe Dashboard change is required for these.

- [ ] **Stripe.js / allowed origins**  
  If you use Stripe’s hosted or embedded UIs, ensure `https://boatbrosatx.com` is allowed in Stripe Dashboard (e.g. Settings → Branding or the product you use). Usually automatic for the domain you’re redirecting to.

---

## 3. Firebase (Auth + Firestore)

- [ ] **Authorized domains**  
  [Firebase Console](https://console.firebase.google.com) → your project → **Authentication** → **Settings** → **Authorized domains**:
  - Add `boatbrosatx.com` (and `www.boatbrosatx.com` if you use it).  
  Without this, admin login and any client-side Firebase Auth will fail on the new domain.

- [ ] Firestore and Storage are not domain-specific; they work from any domain as long as env vars (e.g. `FIREBASE_PROJECT_ID`, service account or `FIREBASE_PRIVATE_KEY`) are correct. No change needed for the domain itself.

---

## 4. Google Search Console

- [ ] **Add property**  
  [Search Console](https://search.google.com/search-console) → Add property → URL prefix: `https://boatbrosatx.com`. Verify (HTML file, DNS, or meta tag as you prefer).

- [ ] **Sitemap**  
  Submit `https://boatbrosatx.com/sitemap.xml`. The app generates this from `NEXT_PUBLIC_SITE_URL`, so it will list boatbrosatx.com URLs once that env is set.

- [ ] **Old domain**  
  If you had another domain (e.g. Vercel default): add a 301 redirect from old → `https://boatbrosatx.com` (in host or DNS), and in Search Console you can use “Change of address” or keep the old property and rely on redirects.

---

## 5. Brevo (transactional email)

- [ ] **Sender domain**  
  Emails use `BREVO_SENDER_EMAIL` or default `noreply@boatbrosatx.com`. In Brevo: **Senders & IP** → **Senders** → add and verify the sender (e.g. `noreply@boatbrosatx.com` or your chosen address). Links in emails use `APP_BASE_URL`, so once that is `https://boatbrosatx.com`, links will point to the new domain.

- [ ] No separate “domain” setting for the site URL; `APP_BASE_URL` drives links.

---

## 6. DNS

- [ ] **A / CNAME**  
  Point `boatbrosatx.com` (and www if used) to your host (e.g. Vercel’s targets). Your host’s “Domains” instructions are the source of truth.

- [ ] **SSL**  
  Hosts like Vercel provision HTTPS for the custom domain automatically once DNS is correct.

---

## 7. Optional: analytics, ads, other

- [ ] **Google Analytics (GA4)**  
  If you use it: add `https://boatbrosatx.com` as a stream URL or in allowed referrals if needed.

- [ ] **Google Ads / other paid**  
  Update final URL and any domain-specific settings to `boatbrosatx.com`.

- [ ] **Social / review links**  
  Update any links (e.g. footer, social, Yelp, TripAdvisor) to use `https://boatbrosatx.com`.

---

## Quick reference: env vars that must match the new domain

| Variable | Production value |
|----------|------------------|
| `NEXT_PUBLIC_SITE_URL` | `https://boatbrosatx.com` |
| `APP_BASE_URL` | `https://boatbrosatx.com` |

Everything that depends on “the site URL” in this app (canonicals, sitemap, Stripe redirects, waiver links, emails) uses one of these two. Set both, then go through Stripe, Firebase Auth, Search Console, and Brevo as above so nothing breaks.
