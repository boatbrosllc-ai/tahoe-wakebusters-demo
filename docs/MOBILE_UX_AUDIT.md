# Boat Bros ATX — Mobile UX Audit & 10x Improvement Plan

**Scope:** Mobile viewports 390×844 (iPhone 14), 360×800 (Android).  
**Source of truth:** Codebase as of audit. No implementation in this doc — diagnosis and plan only.

---

## 1) Route map

| Route | File path | Renders on mobile |
|-------|----------|-------------------|
| `/` | `app/(site)/page.tsx` | Hero → ExperienceChooser → HowItWorks → Testimonials → GalleryPreview → LeadCapture |
| `/book` | `app/(site)/book/page.tsx` | H1 + copy; if no `?experience`: pill links to choose experience; then BookingEmbed (link mode: dashed box + “Continue to Check Availability”) in white card + BookingCTA (Check Availability + Call) below |
| `/experiences` | `app/(site)/experiences/page.tsx` | H1 + intro; grid of ExperienceCards; “Check Availability” button at bottom |
| `/experiences/[slug]` | `app/(site)/experiences/[slug]/page.tsx` | Full-width hero image; then 1-col layout: description, highlights, gallery; sidebar (sticky top-24) with duration/capacity/pricing + BookingCTA; FAQs accordion; “Check Availability” + “All experiences” buttons |
| `/faqs` | `app/(site)/faqs/page.tsx` | H1 + intro; Accordion of FAQs; BookingCTA at bottom |
| `/contact` | `app/(site)/contact/page.tsx` | H1 + intro; 1-col: contact list (phone, email, address) then ContactForm in card |
| `/our-story` | `app/(site)/our-story/page.tsx` | H1 + prose; “Check Availability” + “Contact us” buttons |
| `/more` | `app/(site)/more/page.tsx` | “Menu” H1; nav cards (Home, Experiences, Book Now, Our Story, FAQs, Contact); CallCard; “Check Availability” button |
| `/blog` | `app/(site)/blog/page.tsx` | H1 + intro; grid of blog cards (or “Posts coming soon”); each card links to `/blog/[slug]` |
| `/blog/[slug]` | `app/(site)/blog/[slug]/page.tsx` | Back link; optional image; title/date/author; prose; “All posts” button |

**Layout (all pages):** `app/(site)/layout.tsx` — Header (sticky), main, Footer, MobileStickyBar (fixed bottom, `lg:hidden`), then spacer `h-24 lg:hidden`.

---

## 2) Component map

**Navigation (mobile)**  
- **Header** (`components/site/Header.tsx`): Logo (monogram, teal bar `max-lg:bg-brand-primary`) + single Calendar icon link to `/book`. No hamburger; no nav links on mobile.  
- **MobileStickyBar** (`components/site/MobileStickyBar.tsx`): Fixed bottom, `lg:hidden`, 5 items — Home, Experiences, **Book Now** (center, elevated pink CTA), More, Contact. “More” links to `/more`. Active state via pathname. Safe-area padding.  
- **Footer** (`components/site/Footer.tsx`): Same on all viewports; links to Experiences, Book, FAQs, Our Story, Contact, Blog (no `/more`).

**Hero**  
- **Hero** (`components/site/Hero.tsx`): Full-viewport dark section; background image + gradient; logo (white, `h-52` mobile); H1; subtext; bullets; BookingCTA (Check Availability + Call); TrustRow; bottom spacer `h-20 sm:hidden` for nav.

**Cards & lists**  
- **ExperienceCard** (`components/site/ExperienceCard.tsx`): Image, title, short description, duration/capacity, highlights, footer with “Learn more” link + BookingCTA (inline). **Card is not a single tap target** — only “Learn more” and CTA links are clickable.  
- **More page** uses `Card` + `CardContent` for each nav item; **CallCard** (`components/site/CallCard.tsx`) for tel link with analytics.

**CTAs & booking**  
- **BookingCTA** (`components/site/BookingCTA.tsx`): Variants primary/secondary/inline. Renders “Check Availability” (Link to `/book` or `/book?experience=…`) + optional “Call Now” (tel). Uses `siteConfig` for `phoneTel`.  
- **BookingEmbed** (`components/site/BookingEmbed.tsx`): If `siteConfig.booking.mode === "embed"` and `embedSrc` → iframe. Else **link mode**: dashed box + single external link to `siteConfig.booking.providerUrl` (“Continue to Check Availability”).  
- **TrustRow** (`components/site/TrustRow.tsx`): Stars, “4.9 (200+ reviews)”, “Local Austin crew”, “Captain options”. No links.

**Other**  
- **HowItWorks**, **Testimonials**, **GalleryPreview**, **LeadCapture**: Section layout; no mobile-specific structure.  
- **ContactForm** (`components/site/ContactForm.tsx`): Inputs h-11; submit Button size lg.

**Brand/config**  
- **Phone, booking URL, colors:** `config/site.ts` — `phone`, `phoneTel`, `booking.mode`, `booking.providerUrl`, `brand` (colors).  
- **Logos, copy, address, socials:** `content/brand.ts`.  
- **CSS variables:** `app/globals.css` — `--brand-primary`, `--brand-secondary`, etc.  
- **Tailwind:** `tailwind.config.ts` — brand colors, shadow-soft, shadow-premium. **Note:** `shadow-soft-lg` used in `more/page.tsx` and `CallCard.tsx` is not defined in theme (Tailwind may not output it).

---

## 3) CTA + funnel map

**How a user gets to book**  
1. **Land on home:** Hero has BookingCTA (Check Availability + Call). Bottom bar has “Book Now” (center). Header has Calendar → `/book`.  
2. **Choose experience:** Home has ExperienceChooser (cards). Each card: “Learn more” → `/experiences/[slug]`; “Check Availability” → `/book?experience=slug`. Bottom bar “Experiences” → `/experiences`; then card or bottom CTA → `/book`.  
3. **Book:** `/book` shows experience pills (if no `?experience`), then BookingEmbed. In **link mode** (current config): dashed box + “Continue to Check Availability” (external) and below it BookingCTA again (Check Availability + Call). So **two separate booking CTAs** on same page.  
4. **Call/text:** Hero “Call Now”; header (desktop only shows phone); More page CallCard; BookingCTA “Call Now” on hero, book page, experience cards, FAQs; Contact page tel/email; Footer phone.

**CTA inventory (mobile)**  
- **Check Availability / Book:** Hero (BookingCTA), bottom bar center “Book Now”, header Calendar icon, ExperienceCard (inline BookingCTA), HowItWorks button, experiences page bottom button, experience detail sidebar + bottom buttons, FAQs BookingCTA, our-story button, more page button, book page (BookingEmbed link + BookingCTA).  
- **Call:** Hero, BookingCTA instances, More CallCard, Contact, Footer.  
- **Learn more / experience:** ExperienceCard “Learn more”, GalleryPreview “See all experiences”.

**Gaps / friction**  
- **Book page:** Double CTA (BookingEmbed “Continue to Check Availability” + BookingCTA “Check Availability”) and `providerUrl` is placeholder `https://example.com/boat-bros-booking` — not production.  
- **Experience detail (mobile):** Booking CTA is in sidebar that appears **after** long content (description, highlights, gallery); no sticky CTA bar.  
- **Experience cards:** Whole card not clickable; small “Learn more” and inline CTA — more taps, less obvious.  
- **Contact:** No one-tap “Call” or “Text” in header on mobile (only Calendar).

---

## 4) Mobile UX scorecard (0–10) + problems

| Area | Score | Evidence | Why it limits conversions | What “10x” looks like |
|------|-------|---------|----------------------------|------------------------|
| **Mobile navigation clarity** | 7 | Bottom bar: Home, Experiences, Book Now (center), More, Contact. Header: logo + Calendar only. More → full nav page. | “More” is a full page trip; no direct FAQs/Story from bar. Bar is clear but secondary nav is one extra step. | Either: bar has 5 items + clear “More” that doesn’t feel like a dead end, or critical secondary links (e.g. FAQs) in bar; consistent back/context. |
| **Booking funnel friction** | 5 | Book page: two CTAs (embed link + BookingCTA). External URL is placeholder. Experience detail: CTA below fold after long content; no sticky book bar on mobile. | Confusing double CTA; placeholder URL = no real booking. On experience detail, intent to book is high but CTA is far down. | Single clear path to book; real provider URL; on experience detail, sticky or above-fold “Book this experience” on mobile. |
| **CTA visibility & placement** | 6 | Hero has primary CTA; bottom bar “Book Now” is prominent. Experience cards: CTA is inline with “Learn more” (competing). Experience detail: CTA in sidebar after content. | Competing links on cards; CTA buried on long experience pages. | One primary CTA per context; “Book Now” always visible or one scroll away on key pages. |
| **Visual hierarchy / spacing** | 6 | `section-padding` py-16–24; container-narrow/wide. Hero content max-w-2xl. No mobile-specific density or spacing scale. | Sections can feel long on small screens; hierarchy is consistent but not tuned for thumb zone. | Tighter mobile rhythm; key actions in thumb zone; clear visual “next step” on each screen. |
| **Readability / typography** | 7 | H1 2xl–3xl on mobile; body text-sm/base. Good contrast (white on dark, dark on light). No explicit mobile type scale. | Adequate but not tuned for 360–390px; line length can be long in narrow containers. | Mobile-first type scale; max line length; slightly larger touch-context labels. |
| **Trust & social proof placement** | 6 | TrustRow in hero (stars, reviews, crew). Testimonials section below hero. No trust in booking or experience detail. | Trust is “above the fold” on home only; at decision points (book, experience) it’s missing. | Trust near every booking CTA (e.g. “4.9 · 200+ reviews” next to Book button). |
| **Page speed / image optimization** | 7 | Hero + header logos + experience hero: `priority`. Hero bg + experience images: `sizes` set. Next/Image used. | LCP helped by priority; no explicit fetchpriority or per-route image strategy. | LCP < 2.5s; critical images priority + optimal sizes; no layout shift. |
| **Accessibility / tap targets** | 6 | Button: default h-11 (44px), sm h-9 (36px). MobileStickyBar ~56px row. Accordion trigger py-4. ExperienceCard “Learn more” and inline CTA are small. | sm buttons below 44px; card links are text-sized (no min tap area). | All interactive elements ≥44×44px on mobile; focus states consistent. |
| **Consistency across pages** | 7 | Same header, footer, bottom bar. Section titles and container usage consistent. More page is card list; others are section-based. | Book page layout (dashed box + CTA) differs from rest; experience detail sidebar vs other pages. | Same patterns for “choose → book”; consistent CTA style and placement. |
| **Delight (motion, micro-interactions)** | 5 | Framer Motion on Hero (logo, copy, CTAs), ExperienceCard, HowItWorks, Testimonials, GalleryPreview (scroll-in). No haptic or button feedback; no loading states on nav. | Feels functional, not “premium” or fun; no feedback on tap (e.g. bottom bar). | Subtle motion on key actions; clear pressed/loading states; one or two signature moments (e.g. hero or success). |

---

## 5) 10x improvement plan (prioritized)

### P0 — Must-do conversion wins

| # | What to change | Where | Effort | Acceptance criteria |
|---|----------------|-------|--------|---------------------|
| P0-1 | **Single booking path on /book** — Remove duplicate CTA. In link mode show only BookingEmbed block (one “Continue to Check Availability” or “Check Availability”) and optionally one Call link; remove redundant BookingCTA below when it’s the same destination. | `app/(site)/book/page.tsx`, `components/site/BookingEmbed.tsx` | S | One clear primary CTA to provider; no duplicate “Check Availability” on same page. |
| P0-2 | **Wire booking URL** — Use real `providerUrl` (env or config). Replace placeholder so “Check Availability” goes to live Calendly/FareHarbor/etc. | `config/site.ts` (and env), any component that links to booking | S | Clicking book CTA opens real booking flow. |
| P0-3 | **Sticky “Book this experience” on mobile (experience detail)** — On viewports below `lg`, show a fixed bottom bar or sticky CTA (e.g. “Check availability — [Experience name]”) so user can book without scrolling past full content. | `app/(site)/experiences/[slug]/page.tsx` | M | On mobile, a book CTA is visible without scrolling to sidebar; taps go to `/book?experience=slug`. |
| P0-4 | **Experience cards: whole card tappable** — Make the entire ExperienceCard navigate to `/experiences/[slug]` on mobile (or all viewports), with “Check Availability” as a separate button that doesn’t trigger card navigation. | `components/site/ExperienceCard.tsx` | M | Tapping card (not the CTA button) opens experience detail; CTA still goes to book. |
| P0-5 | **Trust next to booking** — Add a one-line trust line (e.g. “4.9 · 200+ reviews · Local crew”) near the primary CTA on /book and on experience detail booking CTA. | `app/(site)/book/page.tsx`, `app/(site)/experiences/[slug]/page.tsx` (and/or shared component) | S | Trust copy visible at point of booking decision. |

### P1 — Polish + clarity

| # | What to change | Where | Effort | Acceptance criteria |
|---|----------------|-------|--------|---------------------|
| P1-1 | **Bottom bar tap targets** — Ensure each bar item has min 44px height and clear hit area; add subtle pressed state (e.g. scale or opacity). | `components/site/MobileStickyBar.tsx` | S | All items ≥44px; visible feedback on tap. |
| P1-2 | **Button size on mobile** — Use at least `size="lg"` (h-12) for primary CTAs on mobile, or add a mobile-only variant so sm (h-9) is not used for primary actions. | `components/ui/button.tsx`, usage in Hero, BookingCTA, key pages | S | Primary CTAs ≥44px height on mobile. |
| P1-3 | **Define shadow-soft-lg** — Add `shadow-soft-lg` to Tailwind theme so More page and CallCard hover state render correctly. | `tailwind.config.ts` | S | No missing utility; hover matches intent. |
| P1-4 | **Accordion tap targets (FAQs)** — Ensure AccordionTrigger has min-height 44px and padding for touch. | `components/ui/accordion.tsx`, `app/(site)/faqs/page.tsx` | S | FAQ rows easy to tap on mobile. |
| P1-5 | **Contact page: mobile order** — On mobile, consider putting “Call” / “Text” (or one primary contact method) above the form so call-to-action is immediate. | `app/(site)/contact/page.tsx` | S | One-tap call or prominent contact at top on small viewports. |
| P1-6 | **More page: add Blog** — Add a “Blog” card to the More page so blog is discoverable from mobile nav. | `app/(site)/more/page.tsx` | S | Blog link in More nav list. |

### P2 — Delight + “sexy/fun” layer

| # | What to change | Where | Effort | Acceptance criteria |
|---|----------------|-------|--------|---------------------|
| P2-1 | **Hero entrance** — Slightly stronger entrance (e.g. logo scale + fade, then headline, then CTA) with reduced motion support. | `components/site/Hero.tsx` | S | Feels intentional and premium; respects prefers-reduced-motion. |
| P2-2 | **Bottom bar feedback** — Light scale or opacity change on bar item press. | `components/site/MobileStickyBar.tsx` | S | Tactile feedback on tap. |
| P2-3 | **Success state after lead/contact** — Short confetti or checkmark animation after LeadCapture or ContactForm success. | `components/site/LeadCapture.tsx`, `components/site/ContactForm.tsx` | S | Clear, positive confirmation. |
| P2-4 | **Loading state for booking exit** — When user taps “Check Availability” to external site, show brief “Taking you to booking…” or spinner so they don’t think nothing happened. | `components/site/BookingEmbed.tsx` or BookingCTA usage | S | Feedback before navigation. |
| P2-5 | **Micro-copy** — One or two lines on hero or book page that feel human/fun (e.g. “Same-day trips? We’ve got you.”) without changing structure. | `content/brand.ts` or inline in Hero / book page | S | Copy feels on-brand and inviting. |

---

## 6) Mobile navigation recommendation

**Recommendation: Option B — Full bottom tab bar with center “Book Now” (current pattern, refined).**

**Why not A (sticky bottom CTA only)**  
- You already have a full bottom bar with Home, Experiences, Book Now, More, Contact. Replacing it with a single CTA would remove quick access to Experiences and More and hurt discovery.

**Why not C (header-only)**  
- Header is already minimal on mobile (logo + Calendar). Putting all nav in the header would require a hamburger or many icons; you moved away from a sheet to a **More page** for clarity. Header-only would either cram too much or hide nav behind a menu again.

**Why B**  
- **Book Now** is the main conversion goal; having it in the center of the bar (elevated, pink) keeps it visible and one tap away on every page.  
- Home, Experiences, and Contact cover the main journeys; More handles FAQs, Story, Blog, and Call without cluttering the bar.  
- The implementation is already in place; P0/P1 improvements (tap targets, trust at booking, single book path, sticky CTA on experience detail) don’t require changing the nav pattern.

**Refinements to current B**  
- Ensure bar items are 44px+ and have press state (P1-1).  
- Add Blog to More page (P1-6).  
- Optionally add a small “Call” icon in the header next to Calendar on mobile for one-tap call (P1-5 style) without changing the bar.

---

## 7) Quick wins (ship in 1 day)

1. **Single CTA on /book** — In link mode, remove the extra BookingCTA below BookingEmbed so there’s one “Continue to Check Availability” (or one Check + one Call). Files: `app/(site)/book/page.tsx`.  
2. **Real booking URL** — Set `config/site.ts` (or env) `booking.providerUrl` to the real booking provider; verify link opens correct site.  
3. **Trust line on book page** — Add TrustRow (or one-line “4.9 · 200+ reviews”) directly above or below the main CTA on `/book`. Files: `app/(site)/book/page.tsx`, optionally reuse `TrustRow` or a slim variant.  
4. **Minimum tap height for primary CTAs** — In `BookingCTA` and Hero, use `size="lg"` (or a mobile override) so buttons are h-12 on mobile. Files: `components/site/BookingCTA.tsx`, `components/site/Hero.tsx`.  
5. **Define shadow-soft-lg** — In `tailwind.config.ts` theme.extend.boxShadow add `"soft-lg": "…"` (e.g. between soft and premium) and use it in `more/page.tsx` and `CallCard.tsx` so hovers are correct. Files: `tailwind.config.ts`, `app/(site)/more/page.tsx`, `components/site/CallCard.tsx`.

---

**Document version:** 1.0 (audit only; no code changes).  
**Next step:** Prioritize P0 items and implement; then P1; then P2 and quick wins as needed.
