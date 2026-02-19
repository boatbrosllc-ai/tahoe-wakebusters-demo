# Admin Blog Studio — Implementation Plan

## Step 1: Repo Scan Report

### Next.js & App Structure
- **Next.js**: 14.2.18 (App Router)
- **Structure**: `app/(site)/` for public pages, `app/(site)/admin/(dashboard)/` for admin UI, `app/api/` for Route Handlers
- **Config**: `next.config.js` — firebase-admin externalized, image remotePatterns for https/http

### Admin Auth
- **Guard**: `requireAdminSession(cookieHeader)` in `lib/admin-auth-firebase.ts` — returns `Response | null` (null = allowed)
- **Session**: Firebase Auth session cookie via `createAdminSessionCookie(idToken)` / `verifyAdminSessionCookie(cookieHeader)`
- **Allowed emails**: `getAllowedAdminEmails()` — super-admin (boatbrosllc@gmail.com) + `ADMIN_EMAIL` env
- **Layout**: `app/(site)/admin/(dashboard)/layout.tsx` — server-side `verifyAdminSessionCookie` then redirect to `/admin/login` if invalid; wraps children in `<AdminShell>`

### Firebase
- **Admin**: `lib/booking/firebase-admin.ts` — `getDb()`, `getStorageBucket()`, `getFirestoreExports()` (FieldValue, Timestamp)
- **Env**: `lib/booking/env.ts` — `hasFirebaseConfig()`, `safeHasFirebaseConfig()`, `bookingEnv.firebaseProjectId`, etc.
- **Storage**: `getStorageBucket()` used in `app/api/admin/upload/route.ts` — multipart upload, prefix param, returns `{ url, path }`

### Styling & Components
- **Tailwind**: `app/globals.css` — CSS vars `--brand-primary`, `--brand-secondary`, `--brand-dark`, `--brand-muted`, `--brand-bg`
- **Utils**: `lib/utils.ts` — `cn()` (clsx + tailwind-merge)
- **UI**: `components/ui/button.tsx` (CVA variants), `components/ui/dialog.tsx` — Radix-based
- **Admin shell**: Dark sidebar, nav groups (Overview, Content, Business), `AdminShell.tsx` uses `cn()`, Lucide icons

### Existing Blog
- **Source**: `content/blog.ts` — static array `blogPosts`, types `BlogPost`, `BlogBodyBlock` (p, h2, h3, ul only)
- **Public**: `app/(site)/blog/page.tsx` (index), `app/(site)/blog/[slug]/page.tsx` (post) — use `getBlogPostBySlug(slug)`, generateStaticParams from blogPosts
- **Sitemap**: `app/sitemap.ts` — includes `/blog` + blogPosts slugs with lastModified
- **No Firestore** for blog today; no admin UI for blog

---

## Step 2: File Structure, Data Model, UI Components

### Firestore Collections (Canonical)
| Collection | Purpose |
|------------|---------|
| `blogPosts` | One doc per post; fields below |
| `blogPostVersions/{postId}/versions` | Subcollection: version snapshots |
| `blogTaxonomy` | Single doc or small collection for categories/tags |
| `blogAuditLogs` | Top-level: actorUid, action, postId, timestamp, diffSummary |

### blogPosts Document Fields
- `status`, `title`, `slug`, `excerpt`, `coverImage`, `ogImage`, `content` (block JSON), `contentText`
- `seo`: metaTitle, metaDescription, canonicalUrl, focusKeyword, robotsIndex, robotsFollow
- `schema`: articleJsonLd, faqJsonLd, breadcrumbJsonLd (derived)
- `author`: name, uid?, avatarUrl?
- `taxonomy`: categories[], tags[]
- `stats`: wordCount, readingTimeMinutes, headingCounts, imagesCount, imagesMissingAltCount, internalLinksCount, externalLinksCount, hasFaq, hasTable
- `publishAt`, `lastPublishedAt`, `createdAt`, `updatedAt`, `createdByUid`, `updatedByUid`, `revision`, `locks`

### Proposed File Structure
```
lib/blog/
  types.ts              # Block types, BlogPost, SEO, Stats, etc.
  schema.ts             # Zod validation for create/update/publish
  firestore.ts          # getDb, blogPosts ref, version ref, audit log write
  seo-score.ts          # Scoring rubric + compute function
  schema-jsonld.ts      # Build Article, FAQ, Breadcrumb JSON-LD
  content-stats.ts      # wordCount, readingTime, headingCounts, etc. from blocks
  internal-links.ts     # Index + suggest (lightweight)

app/api/admin/blog/
  route.ts              # GET list (search, filters, sort), POST create
app/api/admin/blog/[postId]/
  route.ts              # GET one, PATCH save (draft), audit + version
app/api/admin/blog/[postId]/publish/
  route.ts              # POST publish now / schedule / unpublish
app/api/admin/blog/[postId]/restore/
  route.ts              # POST restore from versionId
app/api/admin/blog/[postId]/upload-image/
  route.ts              # POST image upload (Storage), return url + path
app/api/admin/blog/internal-links/
  route.ts              # GET suggest (query param q or postId)

app/(site)/admin/(dashboard)/blog/
  page.tsx              # List: search, filters, sort, bulk actions, status chips
  layout.tsx            # (optional) ensure under dashboard
app/(site)/admin/(dashboard)/blog/new/
  page.tsx              # Redirect to editor with new id or inline new
app/(site)/admin/(dashboard)/blog/[postId]/
  page.tsx              # Editor: 3-panel (editor | settings | command bar)

components/admin/blog/
  BlogPostList.tsx      # Table/cards, filters, bulk actions
  BlogEditorShell.tsx   # 3-panel layout, command bar, unsaved guard
  BlockEditor.tsx       # Block-based editor (add/remove/reorder blocks)
  blocks/              # Paragraph, Heading, List, Quote, Image, Table, FAQ, etc.
  BlogSettingsPanel.tsx # SEO, taxonomy, author, publish options
  SeoScoreCard.tsx      # Score 0–100, checklist, fix actions
  PreviewPanel.tsx      # Mobile/desktop preview + SERP + OG
  VersionHistoryDrawer.tsx
  InternalLinkAssistant.tsx

app/(site)/blog/        # Public blog (keep existing structure; add Firestore source)
  page.tsx              # Index: prefer Firestore published, fallback content/blog
  [slug]/page.tsx       # Post: get from Firestore by slug, else static getBlogPostBySlug
app/api/blog/
  route.ts              # GET list published (for RSS/consumer)
  [slug]/route.ts       # GET one by slug (optional; or server component fetch)
```

### Block Types (Portable JSON)
- `paragraph` | `heading` (level 1|2|3) | `list` (ordered, items[]) | `quote` | `image` (url, alt, caption?) | `gallery` (images[]) | `table` (headers[], rows[][]) | `embed` (provider, url) | `callout` (title?, body) | `faq` (items: {q,a}[]) | `divider` | `keyTakeaways` (items[])
- Each block: `{ id: string, type: string, ...typeSpecificFields }`

### UI Component List (Premium Studio)
- Command bar: Save, Preview, Publish/Schedule, Restore, More (version history)
- Left: Block editor with add-block menu, drag-handle reorder, inline block toolbar
- Right: Tabs or sections — SEO (meta title/desc, focus keyword, canonical, robots), Taxonomy (categories, tags), Author, Publish (status, publishAt), Schema preview
- SEO Score card: circular or bar 0–100, grade, checklist with “Fix” linking to field/block
- Live preview: iframe or same layout with device toggles (mobile/desktop), SERP snippet, OG card
- Version history: list of revisions (date, by, summary), diff summary, Restore button
- Internal link panel: input to search, list of suggested posts, click to insert link at selection or add block

---

## Step 3: Implementation Phases

### Phase 1 — Foundation (no UI breakage)
- Add `lib/blog/types.ts` (block types, BlogPost shape)
- Add `lib/blog/schema.ts` (Zod: create, update, publish validation)
- Add `lib/blog/firestore.ts` (collections, helpers)
- Add `app/api/admin/blog/route.ts` (GET list, POST create) with requireAdminSession
- Add `app/api/admin/blog/[postId]/route.ts` (GET one, PATCH save)
- Add `blogAuditLogs` write on create/save
- Add nav link in AdminShell to Blog Studio

### Phase 2 — Admin List + Editor Shell
- Add `app/(site)/admin/(dashboard)/blog/page.tsx` (list with search, status filter, sort)
- Add `app/(site)/admin/(dashboard)/blog/new/page.tsx` (create then redirect to [postId])
- Add `app/(site)/admin/(dashboard)/blog/[postId]/page.tsx` (editor shell: command bar, left/right panels)
- Add `components/admin/blog/BlogPostList.tsx`, `BlogEditorShell.tsx` (skeleton: title, slug, excerpt, content JSON textarea for now)
- Autosave every 15s + “Saved” indicator; unsaved guard on navigation

### Phase 3 — Block Editor + SEO + Preview
- Add block components (paragraph, heading, list, quote, image, faq, callout, divider, keyTakeaways)
- Add `BlockEditor` with add-block menu, reorder, delete
- Add `lib/blog/content-stats.ts` (wordCount, readingTime, headingCounts, imagesCount, imagesMissingAlt, internal/external links, hasFaq, hasTable)
- Add `lib/blog/seo-score.ts` (rubric 0–100, checklist)
- Add `BlogSettingsPanel` (SEO, taxonomy, author, publish)
- Add `SeoScoreCard` and `PreviewPanel` (SERP + OG)
- Add `lib/blog/schema-jsonld.ts` (Article, Breadcrumb, FAQ from post)
- Publish validation in API (title, slug, metaTitle, metaDescription, exactly one H1, cover alt)

### Phase 4 — Version History, Audit, Images
- Add `blogPostVersions/{postId}/versions` save on each save (or on demand)
- Add restore API and VersionHistoryDrawer
- Add audit log entries for publish, schedule, unpublish, restore
- Add `app/api/admin/blog/[postId]/upload-image/route.ts` (Storage, optional compress, alt in payload)
- Image block: upload button, alt required, OG generation (reuse cover or first image)

### Phase 5 — Public Blog, Sitemap, RSS
- Add Firestore fetch for published posts (by slug, by status)
- Update `app/(site)/blog/page.tsx` to merge Firestore published + static blogPosts (or replace)
- Update `app/(site)/blog/[slug]/page.tsx` to resolve slug from Firestore first, then static
- Metadata + JSON-LD from post.seo and post.schema
- Sitemap: include Firestore published posts with lastmod
- Add `/rss.xml` route (or page) for blog feed
- README section: Blog Studio setup, content model, how to publish, categories/tags

---

## Step 4: Seed / First Post
- Add “Create first post” action on empty list in admin blog page, or
- Add minimal seed script `scripts/seed-blog.js` that creates one draft post in Firestore (optional; can use UI “New post” instead)

---

## Security & Conventions
- All admin blog API routes: `requireAdminSession(request.headers.get("cookie"))` first.
- Mutations only via PATCH/POST; no client Firestore write.
- Slug uniqueness: on save, check `blogPosts` where slug == X and id != currentId; reject if exists.
- Publish validation: run Zod publish schema; return 400 with reasons if invalid.
- Rate limiting: optional simple in-memory throttle on POST/PATCH (e.g. 30/min per IP) to avoid abuse.

---

## SEO Correctness (Non-Negotiable)
- Public post page: Next.js `generateMetadata` from post.seo (title, description, canonical, robots, openGraph, twitter).
- JSON-LD: Article always; Breadcrumb always; FAQPage only if post has FAQ block.
- Sitemap: only published posts; lastmod from updatedAt or lastPublishedAt.
- RSS: title, link, description, pubDate from published posts.

This plan keeps existing booking/admin and static blog intact; new Firestore blog is additive. Public blog can be updated to prefer Firestore then fall back to static content/blog.
