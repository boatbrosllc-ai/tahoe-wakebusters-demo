# Experience Listing Page — Best-in-Class Upgrade Plan

**Goal:** Make the trip detail page (`/experiences/[slug]`) unique, custom, and badass — above average, 100/100, best-in-class — to drive bookings.

**Current state (brief):** Hero + key-facts strip + impact quote + What’s included card + gallery + FAQ + testimonial + Reserve (two-column). Solid structure but still feels “template-y”; missing distinct personality, stronger visual hierarchy, and conversion-focused details.

---

## 1. Current Page Review

### What’s working
- Clear hero with title, subtitle, price badge, CTAs
- Key-facts strip (price, duration, capacity, “Pick your date”)
- Impact quote + dual CTAs
- What’s included as a card (pills, location, cancellation)
- Gallery “See the day” with lightbox
- FAQ before testimonial
- Reserve: two-column on lg (copy left, calendar right), sticky copy
- Mobile sticky bar (price + Reserve)
- Framer Motion for scroll/entrance
- Teal/navy brand colors, display font for headlines

### Gaps vs best-in-class
| Area | Gap |
|------|-----|
| **Hero** | Single image, no scroll cue; “All trips” link is small; no duration/capacity in hero. |
| **Identity** | No strong “Boat Bros” or “Lake Austin” moment; feels generic. |
| **Trust** | No trust strip (free hold, cancel anytime, captain included) near top. |
| **Story** | Impact block is one quote; no “day in the life” or clear “why book us” narrative. |
| **Gallery** | Horizontal strip only; no masonry/bento or “hero second image”; first image not in gallery when only one. |
| **Social proof** | One testimonial, no rating/count, no “X people booked this month” or urgency. |
| **Booking** | Calendar is at bottom; no sticky “book” card on desktop; trust line could be more prominent. |
| **Details** | Start time, meeting point, what to bring often buried or missing from listing. |
| **Visual punch** | Sections look similar (centered text, same padding); no bold layout risks (full-bleed, asymmetric, big type). |
| **Microcopy** | “See dates,” “Pick your date & time” repeated; could be more benefit-led and action-led. |

---

## 2. Upgrade Plan (Phased)

### Phase A — Quick wins (1–2 sessions)
**Objective:** Higher perceived quality and trust without redoing layout.

1. **Trust strip under hero**
   - One line under key-facts: “Free to hold · Cancel or change anytime · Captain included” (or dynamic by experience) with small icons.
   - Same dark bar or a thin teal-accent bar.

2. **Hero refinements**
   - Add a subtle scroll cue (chevron or “Scroll to see your day”) at bottom of hero.
   - Show duration + capacity in hero (e.g. under subtitle): “4 or 8 hours · Up to 12 guests”.
   - Slightly bolder “Reserve your spot” (e.g. shadow or glow) so it’s the single primary action.

3. **Impact block**
   - Use full `descriptionLong` (or 2–3 sentences) so it reads as a short story, not one line.
   - Optional: left-align on desktop, max-width for readability.

4. **What’s included**
   - Add “What to bring” / “What we provide” if data exists; otherwise keep as is.
   - Consider one icon per included item for quicker scan.

5. **Reserve section**
   - Repeat trust line directly above calendar: “Free to hold. Cancel or change anytime.”
   - Optional: “X spots left this week” or “Popular” badge if we have data later.

6. **Mobile sticky bar**
   - Add “Free to hold” or “Cancel anytime” in small text under price so trust is visible without scrolling.

---

### Phase B — Layout & visual hierarchy (2–3 sessions)
**Objective:** Make the page feel custom and “badass,” not a generic template.

1. **Hero**
   - Option A: Split hero — left: title + subtitle + CTAs; right: hero image (50/50 on lg) for a magazine look.
   - Option B: Keep full-bleed but add a bold typographic treatment (e.g. huge “LAKE AUSTIN” or “PONTOON” behind content, very low opacity).
   - Ensure hero image is the single strongest asset; consider different focal point per experience.

2. **Section rhythm**
   - Alternate background where it makes sense: e.g. dark → light (What’s included) → dark (Gallery) → light (FAQ) → dark (Testimonial) → dark (Reserve). Already partially there; tighten contrast (e.g. Gallery vs Reserve).

3. **Gallery**
   - If only one image: don’t show “See the day” or show hero again with different crop/caption.
   - Consider bento/masonry grid for 4+ images (one large, rest smaller) instead of only horizontal scroll.
   - Add “View all X photos” that opens lightbox at first image; keep lightbox as is.

4. **Impact / story block**
   - Give it a distinct look: e.g. one sentence in huge type, rest in normal; or a narrow column (e.g. max-w-xl) with large leading for a “editorial” feel.
   - Optional: small “Day on the water” subhead and 3–4 bullet “moments” (Morning setup → Cruise → Swim stop → Sunset) if content exists.

5. **FAQ**
   - Two-column grid on desktop (questions side-by-side) to reduce scroll.
   - Optional: “Still have questions? Text us at [number]” with a button.

6. **Testimonial**
   - If multiple testimonials: carousel or two quotes side-by-side on desktop.
   - Add a rating (e.g. “5.0”) and “X reviews” if we have/can add that data.
   - Optional: small photo of reviewer (if we have rights).

---

### Phase C — Conversion & polish (1–2 sessions)
**Objective:** Maximize “get people to book” with minimal friction.

1. **Sticky booking card (desktop)**
   - On lg: sticky sidebar or floating card (e.g. right side) with: experience name, “From $X”, “Pick your date” button, “Reserve your spot” button, “Free to hold · Cancel anytime.”
   - Appears after hero (or after key-facts) and stays visible; calendar remains in flow below.

2. **CTA copy**
   - Primary: “Reserve your spot” or “Hold my spot” (keep consistent).
   - Secondary: “See dates & times” instead of “Pick your date & time” where it’s only scrolling.
   - In Reserve section: “Choose your date below — we’ll hold it while you checkout.”

3. **Urgency / scarcity (only if true)**
   - “X people booked Pontoon Party this month” or “Popular” badge if we have data.
   - “Only X dates left in [month]” only if we can compute it; otherwise omit.

4. **Above-the-fold clarity**
   - Ensure hero + key-facts + trust strip answer: What is it? How long? How many? How much? Can I cancel? Where? (location can be “We’ll send exact meeting point after booking” in trust strip or one line.)

5. **Accessibility & performance**
   - Reduce motion respected (already); ensure focus order and aria labels on all interactive elements.
   - Lazy-load gallery images; keep hero priority.

---

### Phase D — Unique / “badass” differentiators (optional, 1–2 sessions)
**Objective:** Make the page unmistakably Boat Bros and memorable.

1. **Brand moment**
   - Dedicated line or block: “Lake Austin. Captain-led. Your day, your way.” or similar; could sit under hero or in impact.

2. **Custom illustrations or patterns**
   - Subtle wave or boat pattern in section dividers or as background (CSS or SVG) to break from “plain blocks.”

3. **Video**
   - If you have a 15–30s clip: hero background (muted) or a “See the day” video block before/after gallery.

4. **Map**
   - Small “Where we go” map (e.g. Lake Austin outline + marker) in location section if it adds value.

5. **Seasonal / dynamic copy**
   - “Perfect for summer weekends” / “Sunset slots fill fast” when relevant; could be driven by CMS or season.

---

## 3. Content / Data Checklist

To support the above without hardcoding:

- [ ] **Trust line copy** — Centralized (e.g. “Free to hold. Cancel or change anytime.”) and optionally “Captain included” per experience.
- [ ] **What to bring** — Per-experience list if desired for “What’s included” or a separate line.
- [ ] **Meeting point** — “We’ll send exact meeting point after booking” vs full address; ensure it’s clear in copy.
- [ ] **Testimonials** — At least one per experience; ideally 2–3 and optional rating/count.
- [ ] **Gallery** — Alt text and order; consider “hero second” image for variety from hero.
- [ ] **FAQ** — Start time, food/drinks, captain, cancellation in first 2–3 questions.

---

## 4. Suggested Implementation Order

1. **Phase A** — Trust strip, hero duration/capacity + scroll cue, impact full description, Reserve trust line, mobile bar trust.
2. **Phase B** — Gallery bento/masonry (or “view all” when 1 image), FAQ two-column, testimonial rating/carousel if data exists, section rhythm pass.
3. **Phase C** — Sticky booking card on desktop, CTA copy pass, above-the-fold check.
4. **Phase D** — Only after A–C feel solid; add brand moment, pattern/video/map if they fit.

---

## 5. Success Criteria

- **Feel:** “This looks custom and premium, not a template.”
- **Clarity:** Within one screen (hero + strip + trust), user knows what it is, price, duration, capacity, and that they can hold/cancel.
- **Trust:** Free hold and cancel policy visible near top and again at booking.
- **Action:** Primary CTA is obvious; path to calendar and to checkout is clear.
- **Mobile:** Sticky bar + one clear CTA; no dead ends.
- **Performance:** No layout shift; images lazy-loaded; reduced motion respected.

---

*Next step: Implement Phase A (quick wins), then iterate on Phase B–C based on your priorities and content.*
