# Tahoe Wakebusters demo

Sales preview of Slipstack branded for [Tahoe Wakebusters](https://tahoewakebusters.com/).

**Branch:** `demo/tahoe-wakebusters`  
**Do not** point their live domain here until they buy and we provision a real customer fork.

## What’s filled in

- Company, marina, phone, email, timezone, cancellation (7-day)
- Logo + fleet photos under `public/brand` and `public/photos/wakebusters`
- Fleet copy: Party Barge, Wakesurf, Tritoon
- FAQs + testimonials from their public site
- Hero / welcome copy tuned for Lake Tahoe

## Local preview

```bash
npm run dev
```

Open `/` for the marketing site and `/admin/login` for the backend (needs Firebase admin env + an admin user).

## Still needed before you send them the link

1. Deploy this branch to a **private Netlify preview** (not tahoewakebusters.com).
2. Seed experiences/boats in admin (or run seed) so booking + calendar aren’t empty.
3. Stripe **test mode** only.
4. Create an operator login for them (not Super Admin).
5. Optional: white logo for dark UI — we only found their black lockup (`TW_BLACK.png`).
