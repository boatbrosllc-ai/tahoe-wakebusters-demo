# How photos got messed up (and what was fixed)

## What changed

### 1. **`getDisplayImageUrl` was added and used everywhere**

- **Commit:** `fbd90f1` — "fix: listing photos - use getDisplayImageUrl for Firebase Storage URLs"
- **Intent:** Firebase Storage URLs (`firebasestorage.googleapis.com`) often return 403, so the fix rewrote them to the equivalent public GCS URL (`storage.googleapis.com`).
- **What actually happened:** The helper was added in `lib/utils.ts`, then **spread to many components**: Hero, GalleryMosaic, ExperienceCard, ExperienceChooser, boats pages, BookingModal, ExperienceCalendarSection, ExperienceOverview, ExperiencesListClient, etc. So every image on the site now goes through this rewrite.

**Why that can break things:**

- The rewrite only changes URLs that match the Firebase pattern; local paths like `/photos/IMG_3160.webp` are returned unchanged, so **local photos aren’t altered** by the logic itself.
- For **Firebase URLs**, the path is decoded then re-encoded. If the stored path has a **leading slash** (e.g. `%2Fphotos%2Fimage.webp`), after decode we get `"/photos/image.webp"`. Splitting on `"/"` gives `["", "photos", "image.webp"]`, and joining encoded segments produces `"//photos/image.webp"`. The final GCS URL then has a **double slash** (`.../bucket//photos/...`), which can 404 or behave badly.
- So: one small encoding edge case can break **all** Firebase-sourced images, while the rest of the code didn’t “touch” the image files themselves—only the URL transformation did.

### 2. **Content-Security-Policy (CSP) was added**

- **Where:** `next.config.js` (security headers), with `default-src 'self'` and **no** `img-src`.
- **Effect:** With no `img-src`, CSP falls back to `default-src`, so images are only allowed from `'self'`. Same-origin images (e.g. `/photos/...` or `/_next/image?url=...`) are fine. But if any image is ever loaded **directly** from an external URL (e.g. Firebase/GCS in an `img` tag or with `unoptimized`), the browser would **block** it. So a strict CSP that wasn’t designed with external image hosts in mind can “mess up” photos that depend on those hosts.

### 3. **No one “touched” the photo files**

- `public/photos/` and the files in it are present in git and on disk; content in `content/experiences.ts` points at paths like `/photos/IMG_3160.webp` and `/photos/IMG_9647%202.webp`, which match the actual filenames. So the breakage wasn’t from deleting or moving the assets; it was from **URL handling** (rewrite + CSP).

## Summary

| Cause | What happened |
|-------|----------------|
| **getDisplayImageUrl** | Added to fix Firebase 403s, then used for almost every image. One path-encoding edge case (leading slash → double slash) can break all Firebase-sourced photos. |
| **CSP** | Headers added with `default-src 'self'` and no `img-src`. External image domains (Firebase/GCS) can be blocked if images are loaded directly. |
| **Photos themselves** | Not deleted or moved; they’re still in `public/photos` and in repo. The issue is URL rewriting and CSP, not the files. |

## Fixes applied

1. **CSP:** Add an explicit `img-src 'self' https: data: blob:` (or the minimal set you need) so same-origin and allowed external image hosts (Firebase, GCS, etc.) work.
2. **getDisplayImageUrl:** Normalize the path (e.g. trim leading/trailing slashes) before splitting and re-encoding so a leading slash never produces a double slash in the GCS URL.

After these, local `/photos/` images should keep working, and Firebase/GCS images should load without 403s or CSP blocks, and without double-slash 404s.
