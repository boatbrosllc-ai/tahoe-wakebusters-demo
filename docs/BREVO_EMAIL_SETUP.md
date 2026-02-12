# How to Get Booking Confirmation Emails to Send

Follow these steps in order. When you're done, run a test booking and the customer should get an email.

---

## Step 1: Get your Brevo API key

1. Log in at [brevo.com](https://www.brevo.com).
2. Go to **SMTP & API** (in the left menu or search).
3. Under **API keys**, click **Generate a new API key**.
4. Name it (e.g. "Boat Bros App"), leave permissions as default (or ensure "Send transactional emails" is allowed), then create it.
5. **Copy the key** (it looks like `xkeysib-xxxxxxxx...`). You only see it once.

---

## Step 2: Put the API key in your app

1. Open your project’s **`.env.local`** file.
2. Find the line: `BREVO_API_KEY=`
3. Paste your key after the `=` with **no spaces**:
   ```env
   BREVO_API_KEY=xkeysib-your-actual-key-here
   ```
4. Save the file.
5. **Restart your dev server** (stop it with Ctrl+C, then run `npm run dev` again).

---

## Step 3: Verify the sender email in Brevo

The app sends emails **from** an address. Brevo only allows sends from addresses you’ve verified.

1. In Brevo, go to **Senders & IP** → **Senders** (left menu).
2. Click **Add a sender**.
3. Use:
   - **From email:** The address you want on the confirmation (e.g. `noreply@boatbrosatx.com` or your real business email like `bookings@yourdomain.com`).
   - **From name:** e.g. `Boat Bros ATX`
4. Save. Brevo will send a **verification email** to that address.
5. Open that email and click the verification link.
6. In Brevo, the sender should now show as **Verified**.

If you use a different “from” address than the default, add to `.env.local`:

```env
BREVO_SENDER_EMAIL=your-verified@yourdomain.com
BREVO_SENDER_NAME=Boat Bros ATX
```

Then restart the server again.

---

## Step 4: Test it

1. On your site, complete a **test booking** (use your own email so you can check the inbox).
2. Pay (use Stripe test card `4242 4242 4242 4242` if in test mode).
3. Check the inbox for that email. If it’s not in Inbox, check **Spam/Junk**.
4. If you still don’t get an email, check the **terminal** where `npm run dev` is running. Look for a red error line containing `[brevo]` or `Brevo send failed`. That message tells you what went wrong (e.g. “Sender not allowed” = Step 3 not done).

---

## Checklist

- [ ] Brevo API key created and copied
- [ ] `BREVO_API_KEY=your-key` in `.env.local` (no quotes, no spaces)
- [ ] Dev server restarted after adding the key
- [ ] Sender added in Brevo → Senders & IP → Senders
- [ ] Sender email verified (verification link clicked)
- [ ] Test booking done; email received (or error in terminal checked)

---

## Still not working?

- **"Missing required env: BREVO_API_KEY"** → Key not in `.env.local` or server not restarted.
- **"Sender not allowed" / 400 in logs** → Sender not added or not verified in Step 3.
- **401 in logs** → Wrong or expired API key; create a new key and update `.env.local`.
- **Booking shows in Admin but no email** → Check terminal for the exact `[brevo]` error; that’s the reason Brevo rejected the send.
