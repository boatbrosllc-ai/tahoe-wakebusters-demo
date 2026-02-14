# Loading & Transitions Plan — Clean Speed, Preload, Smooth UX

## Current state (review)

### What’s working
- **Font:** Syne with `display: "swap"` in root layout — avoids FOIT.
- **Above-the-fold images:** Hero images use `priority` (experience Hero, site Hero, Header logo, ExperiencesListClient hero).
- **Prefetch:** Next.js `<Link>` prefetches by default — in-viewport links get prefetched.
- **Reduced motion:** Experience components (Hero, ExperienceOverview, IncludedGrid, FAQ, Reviews, etc.) use `useReducedMotion()` and skip or shorten animations when requested.
- **Lazy code:** Only `canvas-confetti` is dynamically imported (BookingModal, InlineBookingDetailsStep).
- **Server data:** Experience detail page fetches Firestore on the server and passes data to client — no client-side loading state for that data.

### Gaps
1. **No route-level loading UI** — No `loading.tsx` anywhere. While a page is resolving (e.g. experience slug, lake-austin-pontoon), users see a blank screen or the previous page until the new content is ready.
2. **No navigation progress indicator** — No top-of-page progress bar or spinner on client-side navigation (e.g. NProgress-style).
3. **Heavy client shell** — `SiteChrome` is client (usePathname); Header, Footer, MobileStickyBar always client. First paint is fast but hydration is broad.
4. **Home hero video** — No `preload` policy; large video can compete with LCP. No poster image fallback.
5. **Experience listing** — Full page is client-rendered after server passes data; no skeleton or staged reveal while components mount.
6. **No View Transitions** — Page changes are instant swap; no shared-element or cross-fade.
7. **Framer Motion everywhere** — Many `initial` / `whileInView` animations; low cost but add up on slow devices.

---

## Plan (prioritized)

### 1. Add route-level loading frames (high impact, low effort)
- **Add `loading.tsx`** for routes that do server work or feel slow:
  - `app/(site)/loading.tsx` — global site loading (skeleton or minimal bar).
  - `app/(site)/experiences/[slug]/loading.tsx` — experience detail (e.g. hero-shaped skeleton + strip placeholder).
  - `app/(site)/experiences/lake-austin-pontoon/loading.tsx` — same idea.
  - `app/(site)/booking/loading.tsx` — booking flow (optional).
- **Content of loading:** Reuse layout (header/footer) where possible; show a simple skeleton (hero bar + 2–3 content blocks) or a thin top progress bar so the frame isn’t blank.
- **Result:** Users see a “loading” frame instead of a blank screen during transitions.

### 2. Preload critical frames and assets (high impact)
- **Font preload:** In root layout or `_document`, add `<link rel="preload" href="..." as="font" type="font/woff2" crossorigin>` for Syne if Next.js doesn’t already (check `next/font` output).
- **Critical route prefetch:** Ensure key links are in viewport so Next prefetches them:
  - Home → `/experiences`, `/experiences/lake-austin-pontoon`, `/contact`.
  - `/experiences` → `/experiences/lake-austin-pontoon`, `/experiences/watersports`, etc.
- **Hero image:** Experience listing hero already uses `priority`; ensure first gallery/overview image isn’t lazy if it’s in the first viewport (they’re in same component tree; `priority` on hero is enough for LCP).
- **Optional:** Preload the experience API or key data for pontoon on home (e.g. `<link rel="prefetch" href="/api/experiences/pontoon" />`) if you want even faster TTI on pontoon.

### 3. Smoother navigation (medium impact)
- **Top progress bar on client nav:** Use a thin progress bar (e.g. reading-progress style) that shows on `next/navigation` start and completes on finish. Implement via a client wrapper that listens to route change start/complete (or use a small lib that integrates with App Router).
- **Optional — View Transitions:** If you upgrade or enable experimental View Transitions, use a short cross-fade or shared hero between list → detail so transitions feel smoother (can be Phase 2).

### 4. Home page and hero (medium impact)
- **Video:** Add `preload="metadata"` (or `none`) and a `poster` image so LCP is the poster/hero image, not the video. Keep autoplay/muted/loop for UX.
- **Hero image fallback:** If video fails or is disabled, ensure a static hero image is used (already have Image components; ensure poster or fallback is the same as LCP candidate).

### 5. Experience listing page — staged loading (medium impact, optional)
- **Skeleton or staged reveal:** While the page is client-rendering (first frame after server payload), show:
  - Hero skeleton (same aspect ratio as hero), or
  - Real hero + skeleton cards for “What’s included” / calendar / gallery.
- **Implementation:** Either a small “ready” state (data + layout ready) before showing heavy motion, or wrap sections in Suspense with skeleton fallbacks (e.g. calendar, gallery). Prefer one lightweight skeleton that matches layout over many Suspense boundaries.

### 6. Reduce animation cost on first load (lower priority)
- **Above-the-fold:** For hero and first section, use shorter `initial` delays or CSS opacity/transform only (no layout-triggering motion). Keep `useReducedMotion()` as-is.
- **Below-the-fold:** Keep `whileInView`; consider `once: true` and `amount: 0.1` so animations fire a bit earlier and don’t re-run.

### 7. Config and bundles (low effort)
- **Next config:** Ensure `images` domains/remotePatterns are set (already done). No change needed for loading unless you add blur placeholders.
- **Dynamic imports:** Keep heavy or below-fold-only components (e.g. BookingModal content, admin panels) in dynamic imports if they grow; already doing this for confetti.

---

## Suggested implementation order

1. **Add `app/(site)/loading.tsx`** — Single global loading UI (skeleton or bar) so no route is blank.
2. **Add `app/(site)/experiences/[slug]/loading.tsx`** and **`app/(site)/experiences/lake-austin-pontoon/loading.tsx`** — Experience-shaped skeleton (hero + content blocks).
3. **Home hero video** — Add `poster` and `preload="metadata"` (or `none`).
4. **Navigation progress** — Thin top bar on route change (client component using router events or pathname change).
5. **Prefetch check** — Ensure main nav and experience links are standard `<Link>` and visible so prefetch runs; add any critical prefetch links if needed.
6. **Optional:** Staged/skeleton reveal on experience page; View Transitions later.

---

## Files to add or touch

| Action | File / area |
|--------|-------------|
| Add | `app/(site)/loading.tsx` |
| Add | `app/(site)/experiences/[slug]/loading.tsx` |
| Add | `app/(site)/experiences/lake-austin-pontoon/loading.tsx` |
| Edit | `components/site/Hero.tsx` — video `poster` + `preload` |
| Add (optional) | Client nav progress component + layout or provider |
| Edit (optional) | Root or site layout — font preload if missing |

---

## Success criteria

- No blank screen during navigation: every route shows a loading frame (skeleton or bar) until content is ready.
- LCP and FCP: hero image or poster is the LCP; font doesn’t block.
- Preload: critical links and, if desired, one key API prefetched.
- Smooth feel: optional progress bar on nav; optional View Transitions later.
- Preserve: `useReducedMotion`, existing `priority` usage, and server-side data fetch for experience pages.
