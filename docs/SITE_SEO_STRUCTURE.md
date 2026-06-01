# Site SEO Structure — Pillars & Blog Articles

**Purpose:** Single reference for all indexable SEO URLs (commercial pillars + blog). Add new pages here when they ship.  
**Base URL:** `https://boatbrosatx.com`  
**Last updated:** 2026-06-01

**Related docs**
- [LAKE_AUSTIN_SEO_KEYWORD_STRATEGY.md](./LAKE_AUSTIN_SEO_KEYWORD_STRATEGY.md) — keyword tiers and targeting
- Code sources: `lib/experience/seoLanding.data.ts`, `content/blog.ts`, `lib/blog/cms-posts/`, `app/sitemap.ts`

---

## How to maintain this doc

| When you… | Update… |
|-----------|---------|
| Add a new SEO landing page | Section **Commercial pillar pages → Keyword landing pages** + `lib/experience/seoLanding.data.ts` + route in `app/(site)/` + `app/sitemap.ts` |
| Add a new event/commercial page (custom layout) | Section **Commercial pillar pages → Event pages** + new route file |
| Publish a static blog post | Section **Blog articles → Published (static)** + `content/blog.ts` |
| Seed/publish a CMS blog post | Section **Blog articles → CMS (Firestore)** + `lib/blog/cms-posts/` |
| Add a boat listing pillar | Section **Boat pillar pages** (refresh from Firestore — see below) |
| Add/activate an experience | Section **Experience pillar pages** (refresh from Firestore) |
| Retire or redirect a URL | Section **Redirects**; remove from sitemap if no longer indexable |

**Refresh dynamic lists (boats + experiences + published CMS posts):** Admin → Firestore, or query `blogPosts` (`status == published`), `experiences` (`active == true`), `boats` (`isListingBoat == true`, `active == true`).

---

## Summary counts

| Type | Count | Indexable |
|------|------:|-----------|
| Blog — static (live) | 6 | Yes |
| Blog — CMS seeds (in repo, not yet in Firestore) | 6 | No until published |
| Commercial SEO landing pages | 14 | Yes |
| Event commercial pages | 2 | Yes |
| Dedicated experience SEO page | 1 | Yes |
| Experience pillars (Firestore) | 5 | Yes |
| Boat pillars (Firestore) | 4 | Yes |
| Legacy redirects | 2 | No (308 → canonical) |
| **Total live indexable SEO URLs** | **31** | |

---

## Blog articles

### Published — static (`content/blog.ts`)

These are always live at `/blog/{slug}` with `index, follow`.

| URL | Title | Primary keywords |
|-----|-------|------------------|
| `/blog/lake-austin-bachelorette-boat-rental-guide` | Lake Austin Bachelorette Boat Rental: Pontoon Party Ideas, Tips & What to Book | Lake Austin boat rental for bachelorette, Lake Austin party boat rental, Lake Austin pontoon party |
| `/blog/austin-bachelorette-party-guide-2026-lake-austin-boat-day` | Austin Bachelorette Party Guide for 2026 Built Around the Perfect Lake Austin Boat Day | Austin bachelorette party 2026, Lake Austin bachelorette, Austin bachelorette itinerary |
| `/blog/what-to-bring-lake-austin-boat-rental` | What to Bring on a Lake Austin Boat Rental: The Ultimate Checklist | Lake Austin boat rental, what to bring boat rental, Lake Austin pontoon rental checklist |
| `/blog/best-coves-spots-lake-austin-pontoon-swimming` | Best Coves & Spots on Lake Austin for Pontoon Parties and Swimming | Lake Austin coves, best spots Lake Austin boat, Lake Austin pontoon swimming |
| `/blog/lake-austin-sunset-cruise-guide` | Lake Austin Sunset Cruise: Best Time, Spots & What to Expect | Lake Austin sunset cruise, sunset boat rental Lake Austin |
| `/blog/best-restaurants-lake-austin-boat-day` | The Best Restaurants on Lake Austin to Visit During Your Boat Day | Lake Austin restaurants, restaurants on Lake Austin, Ski Shores Lake Austin |

### CMS — Firestore seeds (`lib/blog/cms-posts/`)

Seed via `POST /api/admin/seed/blog` (see `scripts/seed-blog-posts.mjs`). **Not live until published in admin.**

| URL (when published) | Meta title | Focus keyword | Status |
|----------------------|------------|---------------|--------|
| `/blog/fun-things-to-do-in-austin-for-adults` | Fun Things to Do in Austin for Adults (2025 Guide) | fun things to do in Austin for adults | Seed only |
| `/blog/date-ideas-austin` | Date Ideas Austin: 20+ Romantic & Fun Date Ideas | date ideas Austin | Seed only |
| `/blog/party-boat-rental-austin-lake-austin-vs-lake-travis` | Party Boat Rental Austin: Lake Austin vs Lake Travis | party boat rental Austin Lake Travis | Seed only |
| `/blog/lake-austin-boat-guide` | Lake Austin Boat Guide: Rentals, Tours & Party Boats | Lake Austin boat | Seed only |
| `/blog/austin-bachelorette-party-ideas` | Austin Bachelorette Party Ideas: 2025 Planning Guide | Austin bachelorette party ideas | Seed only |
| `/blog/austin-bachelor-party-ideas` | Austin Bachelor Party Ideas: 2025 Guide | Austin bachelor party ideas | Seed only |

### Blog — add new entry template

```markdown
| `/blog/{slug}` | {Title} | {focus keyword(s)} | {Static / CMS / Published YYYY-MM-DD} |
```

---

## Commercial pillar pages

### Keyword landing pages (14)

Defined in `lib/experience/seoLanding.data.ts`. Routes use `createSeoLandingPageExports`.

| URL | Meta title | Config ID |
|-----|------------|-----------|
| `/boat-rental-austin` | Boat Rentals Austin TX \| Captained Charters on Lake Austin \| Boat Bros ATX | `boat-rental-austin` |
| `/lake-austin-boat-rentals` | Lake Austin Boat Rentals \| Private Captained Charters \| Boat Bros ATX | `lake-austin-boat-rentals` |
| `/austin-party-boat-rentals` | Austin Party Boat Rentals \| Private Pontoon on Lake Austin \| Boat Bros ATX | `austin-party-boat-rentals` |
| `/pontoon-boat-rental-austin` | Pontoon Boat Rental Austin \| Lake Austin Captained Pontoon \| Boat Bros ATX | `pontoon-boat-rental-austin` |
| `/lake-austin-party-boat-rentals` | Lake Austin Party Boat Rentals \| Private Captained Pontoon \| Boat Bros ATX | `lake-austin-party-boat-rentals` |
| `/private-boat-rental-austin` | Private Boat Rental Austin \| Captained Private Charters \| Boat Bros ATX | `private-boat-rental-austin` |
| `/captained-boat-rental-austin` | Captained Boat Rental Austin \| No License Needed \| Boat Bros ATX | `captained-boat-rental-austin` |
| `/boat-ride-austin` | Boat Rides Austin TX \| Private Charters & Sunset Cruises \| Boat Bros ATX | `boat-ride-austin` |
| `/wakesurfing-austin` | Wakesurfing Austin \| Private Wake Boat Charters on Lake Austin \| Boat Bros ATX | `wakesurfing-austin` |
| `/wake-boat-rental-austin` | Wake Boat Rental Austin \| Private Captained Wake Boat \| Boat Bros ATX | `wake-boat-rental-austin` |
| `/wakesurf-club-austin` | Wakesurf Club Austin \| Wednesday Wake Sessions on Lake Austin \| Boat Bros ATX | `wakesurf-club-austin` |
| `/sunset-cruise-austin` | Sunset Cruise Austin \| Public & Private Lake Austin Sunset Cruises \| Boat Bros ATX | `sunset-cruise-austin` |
| `/lake-austin-sunset-cruise` | Lake Austin Sunset Cruise \| Public & Private Charters \| Boat Bros ATX | `lake-austin-sunset-cruise` |
| `/lake-austin-vs-lake-travis-boat-rental` | Lake Austin vs Lake Travis Boat Rental \| Which Is Better? \| Boat Bros ATX | `lake-austin-vs-lake-travis-boat-rental` |

**Sitemap phase:** Phase 1 = first four URLs above; Phase 2–4 = remainder (see `SEO_PHASE_1_PATHS` / `SEO_PHASE_2_4_PATHS` in `app/sitemap.ts`).

### Event pages (2) — custom layout

Canonical short slugs. Full page implementation in `app/(site)/austin-*-boat-rental/page.tsx`.

| URL | Meta title | Notes |
|-----|------------|-------|
| `/austin-bachelorette-boat-rental` | Austin Bachelorette Boat Rental \| Captain Included | Canonical bachelorette commercial page |
| `/austin-bachelor-party-boat-rental` | Austin Bachelor Party Boat Rental \| Captain Included | Canonical bachelor commercial page |

### Dedicated experience SEO page (1)

| URL | Meta title | Notes |
|-----|------------|-------|
| `/experiences/lake-austin-pontoon` | Lake Austin Pontoon Rentals \| Captain Included | Static SEO page; separate from `/experiences/pontoon` booking listing |

### Pillar — add new entry template

```markdown
| `/{slug}` | {Meta title} | `{seoLanding.data.ts id or route file}` | {Phase 1 / 2 / Event / Experience / Boat} |
```

---

## Experience pillar pages (Firestore)

Active experiences with public pages at `/experiences/{slug}`. Meta title uses Firestore `metaTitle` when set, else `{title} | Lake Austin Boat Rentals`.

| URL | Title (Firestore) | Slug |
|-----|-------------------|------|
| `/experiences/pontoon` | Lake Austin Pontoon Charter | `pontoon` |
| `/experiences/watersports` | Lake Austin WaterSports Charter | `watersports` |
| `/experiences/sunset` | Lake Austin Sunset Cruise | `sunset` |
| `/experiences/holiday` | Lake Austin Holiday Boat Tour | `holiday` |
| `/experiences/wakesurfclub` | Wake Surf Club | `wakesurfclub` |

---

## Boat pillar pages (Firestore)

Listing boats at `/boats/{slug}`. Meta title pattern: `{Boat Name} | Lake Austin {Type} Rental | Boat Bros`.

| URL | Boat name | Type |
|-----|-----------|------|
| `/boats/axis-a24-wake-surfwater-sports-boat---14-person-capacity` | Axis A24 Wake Surf/Water Sports Boat - 14 Person Capacity | wake |
| `/boats/bentley-tritoon---14-person-capacity` | Bentley Tritoon - 14 Person Capacity | tritoon |
| `/boats/jc-neptoon-tritoon---14-person-capacity` | JC Neptoon Tritoon - 14 Person Capacity | tritoon |
| `/boats/suntracker-tritoon---14-person-capacity` | Suntracker Tritoon - 14 Person Capacity | tritoon |

---

## Redirects (not indexable)

Permanent 308 redirects. Do not link internally to these URLs.

| Source | Destination |
|--------|-------------|
| `/lake-austin-bachelorette-party-boat-rentals` | `/austin-bachelorette-boat-rental` |
| `/lake-austin-bachelor-party-boat-rentals` | `/austin-bachelor-party-boat-rental` |

Also in `next.config.js` (edge redirects). Page-level `permanentRedirect()` in the old route files.

---

## Internal linking hubs

Pages that surface pillar/blog URLs to crawlers and users:

| Component / file | Role |
|------------------|------|
| `components/site/SeoHubLinks.tsx` | Homepage + experiences hub pill links |
| `lib/experience/seoLandingBlogLinks.ts` | Related blog articles on landing pages |
| `lib/experience/seoLanding.data.ts` | Related experiences cross-links per pillar |
| `app/sitemap.ts` | Sitemap generation |

**Canonical linking rule:** Blog and hub links should point to **short canonical slugs** (e.g. `/austin-bachelorette-boat-rental`, not legacy `/lake-austin-bachelorette-party-boat-rentals`).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-01 | Initial inventory. Canonical bachelorette/bachelor pages at short slugs; legacy lake-austin URLs redirect. 6 static blog posts live; 6 CMS seeds pending Firestore publish. |
