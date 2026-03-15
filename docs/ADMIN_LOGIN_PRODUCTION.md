# Admin login in production

Use this checklist so **boatbrosllc@gmail.com** (and any other admin emails) can sign in on your live site.

## 1. Set environment variables in your host (e.g. Netlify)

In **Netlify** → Site → **Site configuration** → **Environment variables** (or your host’s equivalent), set **all** of these. Redeploy after changing any value.

| Variable | Value | Notes |
|----------|--------|--------|
| `ADMIN_EMAIL` | `boatbrosllc@gmail.com` or `boatbrosllc@gmail.com,boarbtrosllc@gmail.com` | Comma-separated list of emails allowed to sign in. |
| `FIREBASE_PROJECT_ID` | `boat-bros-app` | Must match your Firebase project. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `boat-bros-app` | **Must be exactly the same** as `FIREBASE_PROJECT_ID` or login returns 401. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | (from Firebase Console) | Project settings → Your apps → Web app → API key. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `boat-bros-app.firebaseapp.com` | Or your project’s auth domain. |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-...@boat-bros-app.iam.gserviceaccount.com` | From service account JSON. |
| `FIREBASE_PRIVATE_KEY` | Full key on **one line** with `\n` for newlines | See [BOOKING_SETUP.md](./BOOKING_SETUP.md#production-deployment-netlify--vercel--etc). No quotes. |

**Scope:** For Next.js, these must be available at **runtime**. In Netlify, use scope **“All”** or include **“Build”** and **“Deploy”** so server and client both see them.

## 2. Firebase Console

- **Authentication → Sign-in method:** Enable **Email/Password**.
- **Authentication → Users:** Ensure there is a user with email **boatbrosllc@gmail.com** (and any other emails in `ADMIN_EMAIL`). Set a password for each (Add user or edit user → Password).
- **Authentication → Settings → Authorized domains:** Add your **production domain** (e.g. `yourdomain.com` or `www.yourdomain.com`). Without this, Firebase blocks sign-in on the live site.

## 3. Redeploy

After changing env vars or Firebase settings, trigger a new deploy so the app uses the new values.

## 4. Test

- Open **https://your-production-domain.com/admin/login**
- Sign in with **boatbrosllc@gmail.com** and the password set in Firebase
- You should be redirected to `/admin`

If you get **401 "Invalid or expired token"**:

1. Confirm `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are identical.
2. Confirm `FIREBASE_PRIVATE_KEY` is the full key, one line, with `\n` for newlines (no surrounding quotes).
3. Check host logs (e.g. Netlify → Deploys → latest → Functions / Logs) for `[admin/session] 401:` to see the exact error.
