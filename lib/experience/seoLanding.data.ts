import type { LakeAustinPontoonLayoutEventOverrides } from "@/components/experience/LakeAustinPontoonLayout";
import type { FAQItem } from "@/components/experience/FAQ";
import {
  DEFAULT_TRUST_STRIP,
  EXPERIENCE_CARDS_ALL,
  RELATED_EXPERIENCES_DEFAULT,
  BEST_FOR_PARTY,
  BEST_FOR_GENERAL,
  BEST_FOR_WAKE,
  PONTOON_COMPARISON,
} from "@/lib/experience/seoLanding.shared";
import { getLiveRelatedArticles } from "@/lib/experience/seoLandingBlogLinks";
import { getSeoLandingMedia } from "@/lib/experience/seoLandingMedia";
import { shouldShowExperiencePicker } from "@/lib/experience/seoLandingPicker";

export type SeoLandingPageId =
  | "boat-rental-austin"
  | "lake-austin-boat-rentals"
  | "austin-party-boat-rentals"
  | "pontoon-boat-rental-austin"
  | "lake-austin-party-boat-rentals"
  | "private-boat-rental-austin"
  | "captained-boat-rental-austin"
  | "boat-ride-austin"
  | "wakesurfing-austin"
  | "wake-boat-rental-austin"
  | "wakesurf-club-austin"
  | "sunset-cruise-austin"
  | "lake-austin-sunset-cruise"
  | "lake-austin-vs-lake-travis-boat-rental";

export interface SeoLandingPageConfig {
  id: SeoLandingPageId;
  path: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  heroTitle: string;
  heroSubtitle: string;
  heroIntroParagraph: string;
  overviewHeadline: string;
  overviewStory: string;
  overviewSeoParagraphs: string[];
  overviewTimeline?: { step: string; desc: string }[];
  faq: FAQItem[];
  finalCtaHeadline: string;
  serviceSchemaName: string;
  serviceSchemaType: string;
  breadcrumbCurrentName: string;
  breadcrumbs?: { name: string; href: string }[];
  bookingExperienceSlug?: string;
  schemaVariant?: "service" | "article";
  trustStripItems?: string[];
  experienceCards?: { href: string; title: string; description: string }[];
  bestForItems?: LakeAustinPontoonLayoutEventOverrides["bestForItems"];
  comparisonRows?: LakeAustinPontoonLayoutEventOverrides["comparisonRows"];
  comparisonLeftHeading?: string;
  comparisonRightHeading?: string;
  comparisonHeadline?: string;
  relatedArticles?: LakeAustinPontoonLayoutEventOverrides["relatedArticles"];
  relatedExperiences?: LakeAustinPontoonLayoutEventOverrides["relatedExperiences"];
  layoutVariant?: "commercial" | "guide";
  showMap?: boolean;
  showPricingOverview?: boolean;
  pricingSubtext?: string;
  finalCtaSecondaryHref?: string;
  finalCtaSecondaryCta?: string;
}

function page(
  partial: Omit<SeoLandingPageConfig, "breadcrumbCurrentName"> & { breadcrumbCurrentName?: string },
): SeoLandingPageConfig {
  return {
    trustStripItems: DEFAULT_TRUST_STRIP,
    experienceCards: EXPERIENCE_CARDS_ALL,
    relatedExperiences: RELATED_EXPERIENCES_DEFAULT,
    breadcrumbCurrentName: partial.breadcrumbCurrentName ?? partial.heroTitle,
    ...partial,
  };
}

export const SEO_LANDING_PAGES: Record<SeoLandingPageId, SeoLandingPageConfig> = {
  "boat-rental-austin": page({
    id: "boat-rental-austin",
    path: "/boat-rental-austin",
    metaTitle: "Boat Rentals Austin TX | Captained Charters on Lake Austin | Boat Bros ATX",
    metaDescription:
      "Book a boat rental in Austin, TX. Captained pontoon, wake boat & sunset cruises on Lake Austin. Captain included, no experience needed. Instant online booking.",
    keywords: [
      "boat rental austin",
      "boat rental austin tx",
      "austin boat rentals lake austin",
      "boat ride austin",
      "austin boat rental with captain",
    ],
    heroTitle: "Boat Rentals in Austin, TX",
    heroSubtitle: "Captained charters on Lake Austin — pontoon, wake boat, sunset cruises & Wakesurf Club.",
    heroIntroParagraph:
      "Private boats, licensed captains, instant online booking. No boating license required.",
    overviewHeadline: "Why book a captained boat rental in Austin",
    overviewStory:
      "Every Boat Bros charter is private to your group with a licensed captain on Lake Austin. Skip the stress of driving a rental boat — we handle navigation, anchoring, and safety while you swim, celebrate, or ride the wake.",
    overviewSeoParagraphs: [
      "Austin visitors and locals choose Lake Austin for calm water, limestone bluffs, and easy access from downtown. Our fleet includes spacious pontoons for parties and families, a dedicated wake boat for watersports, and evening sunset cruises when you want a shorter, scenic trip.",
      "Pricing is transparent online with captain included. Bring your own food and drinks (no glass), connect your playlist to our sound systems, and let your captain take you to the best coves and swim spots for the day.",
    ],
    overviewTimeline: [
      { step: "Book", desc: "Pick your experience & time online" },
      { step: "Arrive", desc: "Meet your captain at the dock" },
      { step: "Cruise", desc: "Explore Lake Austin" },
      { step: "Play", desc: "Swim, ride, or celebrate" },
      { step: "Return", desc: "Sunset or dock on schedule" },
    ],
    bestForItems: BEST_FOR_GENERAL,
    showPricingOverview: true,
    faq: [
      {
        question: "Do I need a boating license to rent a boat in Austin?",
        answer:
          "No. Our Austin boat rentals are fully captained — a licensed captain operates the boat so your group can relax. No boating experience or license is required.",
      },
      {
        question: "What's included in an Austin boat rental?",
        answer:
          "Captain, fuel for standard Lake Austin cruising, safety gear, and experience-specific amenities (e.g. lily pad and cooler on pontoon, wake setup on the wake boat). See each experience page for full details.",
      },
      {
        question: "How much does a boat rental in Austin cost?",
        answer:
          "Charter pricing depends on experience and duration. Pontoon charters start from our online calendar; wake boat and sunset cruises have their own rates. All prices shown include your captain.",
      },
      {
        question: "Where do Austin boat rentals launch from?",
        answer:
          "We operate on Lake Austin with dock details provided after booking. See our location page for directions and parking.",
      },
      {
        question: "Can I bring my own food and drinks?",
        answer:
          "Yes — BYOB and snacks are welcome. Glass is not allowed on board; use cans or plastic cups. We provide a cooler and ice on pontoon charters.",
      },
    ],
    relatedArticles: [
      {
        href: "/blog/best-boat-rentals-austin",
        title: "Best Boat Rentals in Austin",
        excerpt: "Compare captained pontoons, wake boats, and sunset cruises on Lake Austin.",
      },
      {
        href: "/blog/how-much-does-it-cost-to-rent-a-boat-in-austin",
        title: "How Much Does a Boat Rental Cost?",
        excerpt: "2025 pricing guide for Austin boat rentals with captain included.",
      },
    ],
    relatedExperiences: [
      { href: "/lake-austin-boat-rentals", title: "Lake Austin boat rentals" },
      { href: "/austin-party-boat-rentals", title: "Austin party boat rentals" },
      { href: "/pontoon-boat-rental-austin", title: "Pontoon boat rental Austin" },
      ...RELATED_EXPERIENCES_DEFAULT,
    ],
    finalCtaHeadline: "Book your Austin boat rental",
    serviceSchemaName: "Boat Rentals in Austin, TX",
    serviceSchemaType: "Boat Rental",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "Boat rental Austin", href: "/boat-rental-austin" },
    ],
  }),

  "lake-austin-boat-rentals": page({
    id: "lake-austin-boat-rentals",
    path: "/lake-austin-boat-rentals",
    metaTitle: "Lake Austin Boat Rentals | Private Captained Charters | Boat Bros ATX",
    metaDescription:
      "Lake Austin boat rentals — pontoon, wake boat & sunset cruises. Captain included, no experience needed. Book online. Boat Bros ATX, Austin TX.",
    keywords: [
      "lake austin boat rentals",
      "boat rental lake austin",
      "austin boat rentals lake austin",
      "lake austin rentals",
      "boat rentals lake austin tx",
    ],
    heroTitle: "Lake Austin Boat Rentals — Private Captained Charters",
    heroSubtitle: "Calm water, captained pontoons, wake boat & sunset cruises.",
    heroIntroParagraph:
      "Lake Austin boat rentals with Boat Bros mean a private captained charter — not a crowded party barge. Your group gets the whole boat, a licensed captain, and some of the best swimming and scenery in Austin.",
    overviewHeadline: "Why Lake Austin for your boat rental",
    overviewStory:
      "Lake Austin offers clear, calm water compared to busier reservoirs, with no-wake zones perfect for swimming and floating. Our captains know the coves, Party Cove timing, and the best spots for photos and sunsets.",
    overviewSeoParagraphs: [
      "Unlike open-lake party barges, our charters are private to your group. Pontoon rentals include premium Bluetooth sound, a lily pad, and cooler with ice. Wake boat charters are built for wakesurfing and wakeboarding. Sunset cruises run most evenings — public shared trips or private bookings.",
      "We're minutes from downtown Austin, making Lake Austin the top choice for locals and visitors who want a full day on the water without a long drive to Lake Travis.",
    ],
    showMap: true,
    faq: [
      {
        question: "What makes Lake Austin different from Lake Travis for boat rentals?",
        answer:
          "Lake Austin is closer to downtown, generally calmer, and ideal for captained private charters. Lake Travis is larger and busier. See our comparison guide for a full breakdown.",
      },
      {
        question: "Is Lake Austin good for swimming?",
        answer: "Yes — many coves offer calm water for swimming and using the lily pad. Your captain picks spots based on conditions and traffic.",
      },
      {
        question: "What are the best coves on Lake Austin?",
        answer:
          "Popular areas include Party Cove and quieter coves for families. Our captains adjust daily — read our blog guide to Lake Austin coves for more detail.",
      },
      {
        question: "How far is Lake Austin from downtown Austin?",
        answer: "Typically 15–25 minutes by car depending on traffic and your launch point. Directions are sent after booking.",
      },
      {
        question: "Are captained boat rentals available on Lake Austin?",
        answer:
          "Yes — every Boat Bros charter includes a licensed captain. No boating license is required for your guests.",
      },
    ],
    relatedArticles: [
      {
        href: "/blog/lake-austin-boat-rental-guide",
        title: "Lake Austin Boat Rental Guide",
        excerpt: "Everything you need to know about renting on Lake Austin.",
      },
      {
        href: "/blog/best-coves-on-lake-austin",
        title: "Best Coves on Lake Austin",
        excerpt: "Captain's guide to swimming and anchoring spots.",
      },
      {
        href: "/blog/lake-austin-vs-lake-travis-boat-rental",
        title: "Lake Austin vs Lake Travis",
        excerpt: "Which lake is better for your boat day?",
      },
    ],
    relatedExperiences: [
      { href: "/boat-rental-austin", title: "Boat rental Austin" },
      { href: "/austin-party-boat-rentals", title: "Austin party boat rentals" },
      { href: "/location", title: "Location & directions" },
      ...RELATED_EXPERIENCES_DEFAULT,
    ],
    finalCtaHeadline: "Book your Lake Austin boat rental",
    serviceSchemaName: "Lake Austin Boat Rentals",
    serviceSchemaType: "Boat Rental",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "Lake Austin boat rentals", href: "/lake-austin-boat-rentals" },
    ],
  }),

  "austin-party-boat-rentals": page({
    id: "austin-party-boat-rentals",
    path: "/austin-party-boat-rentals",
    metaTitle: "Austin Party Boat Rentals | Private Pontoon on Lake Austin | Boat Bros ATX",
    metaDescription:
      "Austin party boat rentals on Lake Austin. Private captained pontoon — perfect for birthdays, bachelorettes, corporate groups. Book your party boat today.",
    keywords: [
      "austin party boat",
      "austin party boats",
      "party boat austin tx",
      "party boat rentals austin",
      "party barge austin",
      "party barge lake austin",
      "lake austin party boat rentals",
    ],
    heroTitle: "Austin Party Boat Rentals — Private Pontoon Charters on Lake Austin",
    heroSubtitle: "Your group, your playlist, your captain — not a shared party barge.",
    heroIntroParagraph:
      "Our Austin party boat rentals are private captained pontoons on Lake Austin — ideal for birthdays, bachelorettes, bachelor parties, and corporate group days. Bring your crew, drinks, and music; we handle the boat.",
    overviewHeadline: "The Austin party boat experience",
    overviewStory:
      "Skip the crowded party barge and book a private pontoon built for celebrations. Spacious seating, Bluetooth sound, lily pad for swimming, and a captain who knows Party Cove and the best photo spots.",
    overviewSeoParagraphs: [
      "Groups love Lake Austin for calm water and easy cruising between swim spots. Decorations are welcome within reason (no confetti in the lake). Glass is not allowed — use cans or plastic cups for champagne and cocktails.",
      "Planning a bachelorette or bachelor weekend? See our dedicated Lake Austin party pages for group-specific tips and booking.",
    ],
    bestForItems: BEST_FOR_PARTY,
    experienceCards: EXPERIENCE_CARDS_ALL.filter((c) => c.href.includes("pontoon") || c.href.includes("sunset")),
    faq: [
      {
        question: "Can I bring alcohol on a party boat in Austin?",
        answer: "Yes, BYOB is allowed. No glass on board — use cans or plastic. We provide cooler and ice on pontoon charters.",
      },
      {
        question: "How many people fit on an Austin party boat?",
        answer: "Our pontoon accommodates up to 14 guests. For larger groups, contact us about multiple charters.",
      },
      {
        question: "What's the difference between a party barge and a pontoon?",
        answer:
          "Party barges are often large shared vessels. Our party boat rentals are private pontoons — only your group, with a dedicated captain.",
      },
      {
        question: "Do you provide a captain for party boat rentals?",
        answer: "Yes — every charter includes a licensed captain.",
      },
      {
        question: "Can I play my own music on the boat?",
        answer: "Yes — connect via Bluetooth to our onboard sound system.",
      },
    ],
    relatedArticles: [
      { href: "/blog/best-party-boat-rentals-austin", title: "Best Party Boat Rentals in Austin", excerpt: "Top captained options for group celebrations." },
      { href: "/blog/austin-party-boat-guide", title: "Austin Party Boat Guide", excerpt: "What to expect, pricing, and how to book." },
    ],
    relatedExperiences: [
      { href: "/lake-austin-party-boat-rentals", title: "Lake Austin party boat rentals" },
      { href: "/austin-bachelorette-boat-rental", title: "Bachelorette party boat" },
      { href: "/austin-bachelor-party-boat-rental", title: "Bachelor party boat" },
      { href: "/pontoon-boat-rental-austin", title: "Pontoon boat rental Austin" },
    ],
    finalCtaHeadline: "Book your Austin party boat",
    serviceSchemaName: "Austin Party Boat Rentals",
    serviceSchemaType: "Party Boat Rental",
    bookingExperienceSlug: "pontoon",
  }),

  "pontoon-boat-rental-austin": page({
    id: "pontoon-boat-rental-austin",
    path: "/pontoon-boat-rental-austin",
    metaTitle: "Pontoon Boat Rental Austin | Lake Austin Captained Pontoon | Boat Bros ATX",
    metaDescription:
      "Pontoon boat rentals in Austin on Lake Austin. Captain included, premium sound, lily pad, cooler. Perfect for groups. Book your Lake Austin pontoon rental.",
    keywords: [
      "pontoon boat rental austin",
      "lake austin pontoon rental",
      "pontoon boat rental lake austin",
      "pontoon boat austin",
      "pontoon boat austin texas",
    ],
    heroTitle: "Pontoon Boat Rentals in Austin — Lake Austin Captained Charters",
    heroSubtitle: "Groups up to 14 · Premium sound · Lily pad · Captain included",
    heroIntroParagraph:
      "Rent a pontoon on Lake Austin with Boat Bros — captained, comfortable, and built for Austin group days. No license needed; your captain handles the boat while you swim, float, and celebrate.",
    overviewHeadline: "What's included in your pontoon rental",
    overviewStory:
      "Our Lake Austin pontoon includes a licensed captain, premium Bluetooth sound, floating lily pad, cooler with ice, and fuel for standard cruising. Perfect for parties, families, and relaxed lake days.",
    overviewSeoParagraphs: [
      "Pontoons are the most popular Austin boat rental for groups who want space to move, shade, and calm-water swimming. Compare to our wake boat if your group wants active watersports instead of anchoring and swimming.",
    ],
    bestForItems: BEST_FOR_PARTY,
    ...PONTOON_COMPARISON,
    faq: [
      {
        question: "How many people fit on a pontoon boat rental in Austin?",
        answer: "Up to 14 guests on our Lake Austin pontoon.",
      },
      {
        question: "What's included in a pontoon rental on Lake Austin?",
        answer: "Captain, sound system, lily pad, cooler with ice, and standard fuel for Lake Austin cruising.",
      },
      {
        question: "Is a pontoon good for a bachelorette party?",
        answer: "Yes — see our Lake Austin bachelorette party boat page for celebration-specific details.",
      },
      {
        question: "Can I wakeboard or wakesurf from a pontoon?",
        answer: "Wakesports require our dedicated wake boat. Pontoons are for cruising, swimming, and group celebrations.",
      },
      {
        question: "How do I book a pontoon rental in Austin?",
        answer: "Choose your date and duration on our booking calendar — instant confirmation online.",
      },
    ],
    relatedArticles: [
      { href: "/blog/pontoon-boat-rental-austin-guide", title: "Pontoon Boat Rental Austin Guide", excerpt: "Pricing, inclusions, and booking tips." },
      { href: "/blog/lake-austin-pontoon-rental-guide", title: "Lake Austin Pontoon Rental Guide", excerpt: "Captain's guide to pontoon days on the lake." },
    ],
    finalCtaHeadline: "Book your pontoon rental",
    serviceSchemaName: "Pontoon Boat Rental Austin",
    serviceSchemaType: "Pontoon Boat Rental",
  }),

  "lake-austin-party-boat-rentals": page({
    id: "lake-austin-party-boat-rentals",
    showMap: true,
    path: "/lake-austin-party-boat-rentals",
    metaTitle: "Lake Austin Party Boat Rentals | Private Captained Pontoon | Boat Bros ATX",
    metaDescription:
      "Lake Austin party boat rentals. Private captained pontoon — birthdays, bachelorettes, group days. Captain included. Book your Lake Austin party boat.",
    keywords: ["lake austin party boat rentals", "lake austin party boat", "lake austin party barge", "lake austin party boat rental"],
    heroTitle: "Lake Austin Party Boat Rentals — Private Captained Pontoon",
    heroSubtitle: "Lake-specific coves, calm water & private celebrations",
    heroIntroParagraph:
      "Lake Austin party boat rentals with Boat Bros are private pontoon charters — your group only, with a captain who knows local coves, no-wake zones, and the best swim spots away from crowded barges.",
    overviewHeadline: "Party on Lake Austin — not a shared barge",
    overviewStory:
      "Lake Austin's calm water and scenery make it the best place for an Austin party boat day. We position at Party Cove or quieter coves depending on your vibe, with lily pad, sound, and cooler ready.",
    overviewSeoParagraphs: [
      "Different from city-wide party boat search intent, this page focuses on Lake Austin: limestone views, swim coves, and captains who live on this lake daily. Pair with our Austin party boat page if you're comparing lakes.",
    ],
    bestForItems: BEST_FOR_PARTY,
    faq: [
      {
        question: "Where do Lake Austin party boats go?",
        answer: "Popular stops include Party Cove and scenic coves — your captain chooses based on weather and crowd levels.",
      },
      {
        question: "Can we bring decorations?",
        answer: "Yes, within reason. Avoid confetti and anything that can blow into the water.",
      },
      {
        question: "Is alcohol allowed?",
        answer: "BYOB welcome; no glass on board.",
      },
      {
        question: "How is this different from Austin party boat rentals?",
        answer: "Same private pontoon product — this page emphasizes Lake Austin-specific routes, coves, and calm-water advantages.",
      },
      {
        question: "Do you offer bachelorette packages?",
        answer: "Yes — see our dedicated bachelorette and bachelor party boat pages.",
      },
    ],
    relatedExperiences: [
      { href: "/austin-party-boat-rentals", title: "Austin party boat rentals" },
      { href: "/lake-austin-boat-rentals", title: "Lake Austin boat rentals" },
      { href: "/experiences/lake-austin-pontoon", title: "Pontoon experience" },
    ],
    finalCtaHeadline: "Book your Lake Austin party boat",
    serviceSchemaName: "Lake Austin Party Boat Rentals",
    serviceSchemaType: "Party Boat Rental",
  }),

  "private-boat-rental-austin": page({
    id: "private-boat-rental-austin",
    path: "/private-boat-rental-austin",
    metaTitle: "Private Boat Rental Austin | Captained Private Charters | Boat Bros ATX",
    metaDescription:
      "Private boat rentals in Austin, TX. Every charter is private — just your group, a captain, and Lake Austin. Pontoon, wake boat & sunset cruises. Book now.",
    keywords: ["private boat rental austin", "austin boat rental with captain", "private boat charter austin"],
    heroTitle: "Private Boat Rentals in Austin — Your Crew, Your Schedule",
    heroSubtitle: "No strangers on board — every trip is yours alone",
    heroIntroParagraph:
      "A private boat rental in Austin with Boat Bros means the entire vessel is reserved for your group. No shared seating, no unknown guests — just your people, a licensed captain, and Lake Austin.",
    overviewHeadline: "Exclusivity on every charter",
    overviewStory:
      "Whether you book a pontoon, wake boat, or sunset cruise, privacy is standard. You choose the music, food, and vibe; we provide the captain, boat, and local knowledge.",
    overviewSeoParagraphs: [
      "Private charters are ideal for families who want control, corporate groups who need professionalism, and celebrations where you don't want a party barge crowd.",
    ],
    bestForItems: BEST_FOR_GENERAL,
    faq: [
      {
        question: "Are Boat Bros charters private?",
        answer: "Yes — pontoon and wake boat charters are private to your group. Public sunset cruises are shared; private sunset bookings are also available.",
      },
      {
        question: "How many guests can we bring?",
        answer: "Pontoon up to 14; wake boat capacity varies — shown at booking.",
      },
      {
        question: "Can we customize the itinerary?",
        answer: "Your captain recommends routes; share preferences for swimming, Party Cove, or quiet coves when you book.",
      },
      {
        question: "Is a private boat rental the same as captained?",
        answer: "All our rentals are captained. Private refers to exclusivity — not sharing with other parties.",
      },
      {
        question: "How do I book a private charter?",
        answer: "Select your experience and time online — the whole boat is yours for that slot.",
      },
    ],
    relatedArticles: [
      { href: "/blog/private-boat-rental-austin-guide", title: "Private Boat Rental Austin Guide", excerpt: "Complete guide to private charters on Lake Austin." },
    ],
    finalCtaHeadline: "Book your private charter",
    serviceSchemaName: "Private Boat Rental Austin",
    serviceSchemaType: "Private Boat Charter",
  }),

  "captained-boat-rental-austin": page({
    id: "captained-boat-rental-austin",
    path: "/captained-boat-rental-austin",
    metaTitle: "Captained Boat Rental Austin | No License Needed | Boat Bros ATX",
    metaDescription:
      "Captained boat rentals in Austin, TX. Every trip includes a licensed captain — no boating experience needed. Relax while we handle the boat. Book now.",
    keywords: [
      "austin boat rental with captain",
      "boat rental lake austin with captain",
      "lake austin boat rentals with captain",
      "captained boat rental austin",
    ],
    heroTitle: "Captained Boat Rentals in Austin — No License Needed",
    heroSubtitle: "Licensed captain on every Lake Austin charter",
    heroIntroParagraph:
      "Every Boat Bros rental is a captained boat rental in Austin — you never drive the vessel. Ideal for visitors, celebrations, and anyone who wants a safe, stress-free day on Lake Austin.",
    overviewHeadline: "Why captained matters on Lake Austin",
    overviewStory:
      "Lake Austin has traffic, no-wake zones, and busy weekends. Our captains are licensed, insured, and know the lake — so your group focuses on fun, not navigation.",
    overviewSeoParagraphs: [
      "Captained charters remove the need for a boating license, rental boat damage worries, and arguing over who drives. You get a professional from dock to dock.",
    ],
    faq: [
      {
        question: "Do I need a license for a captained rental?",
        answer: "No — the captain operates the boat. Guests do not need a boating license.",
      },
      {
        question: "What's the captain responsible for?",
        answer: "Navigation, safety, anchoring, fuel management, and local knowledge of coves and conditions.",
      },
      {
        question: "Can I still choose where we go?",
        answer: "Share preferences with your captain; they'll plan a safe route for your charter length.",
      },
      {
        question: "Are captains licensed and insured?",
        answer: "Yes — Boat Bros operates with licensed, insured captains on Lake Austin.",
      },
      {
        question: "Which experiences are captained?",
        answer: "Pontoon, wake boat, sunset cruises, and Wakesurf Club sessions all include a captain.",
      },
    ],
    relatedArticles: [
      { href: "/blog/captained-boat-rental-austin", title: "Captained Boat Rental Austin", excerpt: "Everything you need to know before you book." },
    ],
    finalCtaHeadline: "Book a captained charter",
    serviceSchemaName: "Captained Boat Rental Austin",
    serviceSchemaType: "Captained Boat Rental",
  }),

  "boat-ride-austin": page({
    id: "boat-ride-austin",
    path: "/boat-ride-austin",
    metaTitle: "Boat Rides Austin TX | Private Charters & Sunset Cruises | Boat Bros ATX",
    metaDescription:
      "Book a boat ride in Austin, TX. Private captained charters and public sunset cruises on Lake Austin. No experience needed. Book online today.",
    keywords: ["boat ride austin", "boat ride lake austin", "austin boat tour"],
    heroTitle: "Boat Rides in Austin — Private Charters & Sunset Cruises on Lake Austin",
    heroSubtitle: "Sightseeing, swimming, sunsets — captain included",
    heroIntroParagraph:
      "Looking for a boat ride in Austin? Choose a private captained pontoon or wake charter for a full lake day, or join an evening sunset cruise — no boating skills required.",
    overviewHeadline: "More than a quick tour",
    overviewStory:
      "Our boat rides are real charters on Lake Austin — not a cramped tour boat. Spend hours swimming, cruising bluffs, or catching golden hour on a sunset trip.",
    overviewSeoParagraphs: [
      "Visitors often search 'boat ride' for experiences rather than driving a rental. We match that intent with captained trips you book like a rental, but without anyone in your group needing to pilot the boat.",
    ],
    bestForItems: [
      { iconKey: "heart", label: "Couples & visitors", desc: "Scenic cruises and sunset rides without driving." },
      { iconKey: "users", label: "Families", desc: "Swim stops and lily pad time on pontoon rides." },
      { iconKey: "sun", label: "Sunset seekers", desc: "Public or private evening cruises on Lake Austin." },
      { iconKey: "party", label: "Special occasions", desc: "Upgrade to a private charter for birthdays and celebrations." },
    ],
    faq: [
      {
        question: "What's the difference between a boat ride and a boat rental?",
        answer: "With Boat Bros they're the same product — captained charters. 'Boat ride' usually means you want an experience; we provide the captain and boat.",
      },
      {
        question: "Do you offer short boat rides?",
        answer: "Sunset cruises are our shorter option; pontoon and wake charters are typically multi-hour.",
      },
      {
        question: "Are sunset cruises public or private?",
        answer: "We offer both — book a ticket on a shared cruise or reserve a private sunset charter.",
      },
      {
        question: "Where do boat rides depart from?",
        answer: "Lake Austin — details after booking. See our location page.",
      },
      {
        question: "Can I book for tourists visiting Austin?",
        answer: "Yes — captained trips are popular for visitors; no local boating knowledge needed.",
      },
    ],
    finalCtaHeadline: "Book your boat ride on Lake Austin",
    serviceSchemaName: "Boat Rides Austin",
    serviceSchemaType: "Boat Charter",
    bookingExperienceSlug: "sunset",
  }),

  "wakesurfing-austin": page({
    id: "wakesurfing-austin",
    path: "/wakesurfing-austin",
    metaTitle: "Wakesurfing Austin | Private Wake Boat Charters on Lake Austin | Boat Bros ATX",
    metaDescription:
      "Wakesurfing in Austin on Lake Austin. Private wake boat charters with a captain. Beginners welcome. Book your Austin wakesurf session.",
    keywords: ["wakesurfing austin", "wakesurf boat rental austin", "wake boat rental austin", "austin wakeboard boat rental"],
    heroTitle: "Wakesurfing in Austin — Private Wake Boat Charters on Lake Austin",
    heroSubtitle: "Beginners welcome · Captain included · Private wake boat",
    heroIntroParagraph:
      "Experience wakesurfing in Austin on our private wake boat — captained sessions on Lake Austin with proper wake setup for learning and progression.",
    overviewHeadline: "Wakesurf on Lake Austin",
    overviewStory:
      "Our wake boat is dedicated to wakesurfing, wakeboarding, and tubing — not a pontoon with a tow rope. Captain handles driving while riders rotate.",
    overviewSeoParagraphs: [
      "New to wakesurfing? Our crew helps with getting up and board basics. For a lower-cost option, try Wakesurf Club Wednesday shared sessions.",
    ],
    bestForItems: BEST_FOR_WAKE,
    experienceCards: EXPERIENCE_CARDS_ALL.filter((c) => c.href.includes("watersports") || c.href.includes("wake-surf")),
    bookingExperienceSlug: "watersports",
    pricingSubtext: "Wake boat charters include captain and standard lake fuel. Gear details shown at booking.",
    faq: [
      {
        question: "Do I need experience to wakesurf in Austin?",
        answer: "No — beginners are welcome on private charters and Wakesurf Club sessions.",
      },
      {
        question: "What's included on a wakesurf charter?",
        answer: "Wake boat, captain, and standard lake fuel. Boards/gear details at booking.",
      },
      {
        question: "How long is a wakesurf session?",
        answer: "Charter lengths vary — select duration when booking online.",
      },
      {
        question: "Wakesurf Club vs private charter?",
        answer: "Club is a shared Wednesday trip per spot; private charter is your whole group on the wake boat.",
      },
      {
        question: "Can I wakeboard too?",
        answer: "Yes — same wake boat supports wakeboarding and tubing.",
      },
    ],
    relatedArticles: [
      { href: "/blog/wakesurfing-austin-beginner-guide", title: "Wakesurfing Austin Beginner Guide", excerpt: "What to expect on your first session." },
      { href: "/blog/wake-boat-rental-austin-guide", title: "Wake Boat Rental Austin Guide", excerpt: "Private wake boat pricing and booking." },
    ],
    finalCtaHeadline: "Book your wakesurf charter",
    serviceSchemaName: "Wakesurfing Austin",
    serviceSchemaType: "Wakesurfing Charter",
  }),

  "wake-boat-rental-austin": page({
    id: "wake-boat-rental-austin",
    path: "/wake-boat-rental-austin",
    metaTitle: "Wake Boat Rental Austin | Private Captained Wake Boat | Boat Bros ATX",
    metaDescription:
      "Wake boat rentals in Austin, TX. Private captained wake boat on Lake Austin — wakesurfing, wakeboarding, tubing. Captain included. Book now.",
    keywords: ["wake boat rental austin", "wakesurf boat rental austin", "ski boat rental austin", "ski boat rental lake austin"],
    heroTitle: "Wake Boat Rentals in Austin — Private Captained Charters on Lake Austin",
    heroSubtitle: "Wakesurf · Wakeboard · Tube — captain drives, you ride",
    heroIntroParagraph:
      "Rent a wake boat in Austin with a captain included. Private Lake Austin charters for wakesurfing, wakeboarding, and tubing — the boat is yours for the session.",
    overviewHeadline: "Dedicated wake boat — not a pontoon tow",
    overviewStory:
      "Our wake boat is built for watersports with proper ballast and wake shape. Ideal for riders who want repetition and coaching without managing the boat.",
    overviewSeoParagraphs: [
      "Compare to pontoon rentals if your group mostly wants swimming and parties; choose the wake boat when riding is the main event.",
    ],
    bestForItems: BEST_FOR_WAKE,
    bookingExperienceSlug: "watersports",
    faq: [
      {
        question: "How much is a wake boat rental in Austin?",
        answer: "Pricing is shown on our booking calendar by duration — captain included.",
      },
      {
        question: "How many riders can go?",
        answer: "Smaller groups than pontoon — ideal for rotating riders; capacity shown at booking.",
      },
      {
        question: "Is equipment provided?",
        answer: "Confirm gear details when booking; captain operates the boat for all sports.",
      },
      {
        question: "Lake Austin vs other lakes?",
        answer: "We operate on Lake Austin for calm, accessible watersports sessions close to Austin.",
      },
      {
        question: "Can beginners book?",
        answer: "Yes — private charters and Wakesurf Club welcome first-timers.",
      },
    ],
    finalCtaHeadline: "Book your wake boat rental",
    serviceSchemaName: "Wake Boat Rental Austin",
    serviceSchemaType: "Wake Boat Rental",
  }),

  "wakesurf-club-austin": page({
    id: "wakesurf-club-austin",
    path: "/wakesurf-club-austin",
    metaTitle: "Wakesurf Club Austin | Wednesday Wake Sessions on Lake Austin | Boat Bros ATX",
    metaDescription:
      "Join the Wakesurf Club in Austin. Wednesday shared wake sessions on Lake Austin — 8 spots per trip. Beginners welcome. Book your spot now.",
    keywords: ["wakesurf club austin", "wednesday wakesurf club austin", "shared wakesurf austin", "public wakesurf austin"],
    heroTitle: "Wakesurf Club Austin — Join a Shared Wake Session on Lake Austin",
    heroSubtitle: "Wednesday sessions · 8 spots · Beginners welcome",
    heroIntroParagraph:
      "Wakesurf Club Austin is our shared Wednesday wake session — book a single spot on the wake boat, meet other riders, and wakesurf on Lake Austin without renting the whole boat.",
    overviewHeadline: "How Wakesurf Club works",
    overviewStory:
      "Each Club trip has limited spots so everyone gets ride time. A captain runs the boat; you show up ready to surf or learn. Perfect for solo riders or pairs.",
    overviewSeoParagraphs: [
      "Want the whole boat? Book a private wake boat rental instead. Club is the affordable entry to wakesurfing in Austin.",
    ],
    bestForItems: BEST_FOR_WAKE,
    experienceCards: EXPERIENCE_CARDS_ALL.filter((c) => c.href.includes("wake-surf")),
    bookingExperienceSlug: "wake-surf-club",
    faq: [
      {
        question: "When is Wakesurf Club?",
        answer: "Wednesday sessions — see the booking calendar for available dates and times.",
      },
      {
        question: "How many spots per session?",
        answer: "Eight spots per trip so each rider gets time behind the boat.",
      },
      {
        question: "Can beginners join?",
        answer: "Yes — beginners are welcome; crew helps with getting started.",
      },
      {
        question: "What should I bring?",
        answer: "Swimsuit, towel, sunscreen, and optional drinks in non-glass containers.",
      },
      {
        question: "How is Club different from a private rental?",
        answer: "Club sells individual tickets on a shared boat; private rental reserves the entire wake boat for your group.",
      },
    ],
    relatedArticles: [
      { href: "/blog/wakesurf-club-austin-how-it-works", title: "Wakesurf Club: How It Works", excerpt: "Wednesday sessions explained." },
    ],
    finalCtaHeadline: "Grab your Wakesurf Club spot",
    serviceSchemaName: "Wakesurf Club Austin",
    serviceSchemaType: "Wakesurfing Club",
  }),

  "sunset-cruise-austin": page({
    id: "sunset-cruise-austin",
    path: "/sunset-cruise-austin",
    metaTitle: "Sunset Cruise Austin | Public & Private Lake Austin Sunset Cruises | Boat Bros ATX",
    metaDescription:
      "Sunset cruises in Austin on Lake Austin. Public cruises every evening + private charters. Captain included. Book your Austin sunset cruise.",
    keywords: ["sunset cruise austin", "austin sunset boat ride", "lake austin sunset cruise", "public sunset cruise austin"],
    heroTitle: "Sunset Cruises in Austin — Public & Private on Lake Austin",
    heroSubtitle: "Evening cruises on Lake Austin · Captain included",
    heroIntroParagraph:
      "Book a sunset cruise in Austin on Lake Austin — join a public evening cruise or reserve a private charter for your group. Golden hour views without driving the boat.",
    overviewHeadline: "Austin sunset on the water",
    overviewStory:
      "Our sunset cruises run on Lake Austin with captains who know the best light and routes for photos. BYOB-friendly policies apply — check FAQs for details.",
    overviewSeoParagraphs: [
      "Public cruises are ticketed per person; private sunsets are ideal for dates, proposals, and small groups who want the boat to themselves.",
    ],
    experienceCards: EXPERIENCE_CARDS_ALL.filter((c) => c.href.includes("sunset") || c.href.includes("pontoon")),
    bookingExperienceSlug: "sunset",
    pricingSubtext: "Public sunset cruises are priced per ticket; private charters are priced by duration. Captain included.",
    faq: [
      {
        question: "Are there public sunset cruises in Austin?",
        answer: "Yes — we offer shared evening cruises on Lake Austin; book tickets online.",
      },
      {
        question: "Can I book a private sunset cruise?",
        answer: "Yes — private charters are available for your group size and date.",
      },
      {
        question: "What time do sunset cruises leave?",
        answer: "Departure times shift with season — shown on the booking calendar.",
      },
      {
        question: "Can I bring drinks?",
        answer: "BYOB is typically allowed; no glass. Confirm details for your specific cruise at booking.",
      },
      {
        question: "Where do sunset cruises depart?",
        answer: "Lake Austin — location details provided after booking.",
      },
    ],
    relatedArticles: [
      { href: "/blog/best-sunset-cruise-austin", title: "Best Sunset Cruise in Austin", excerpt: "Public vs private options compared." },
      { href: "/blog/lake-austin-sunset-cruise-guide", title: "Lake Austin Sunset Cruise Guide", excerpt: "Timing, tips, and what to expect." },
    ],
    finalCtaHeadline: "Book your sunset cruise",
    serviceSchemaName: "Sunset Cruise Austin",
    serviceSchemaType: "Sunset Cruise",
  }),

  "lake-austin-sunset-cruise": page({
    id: "lake-austin-sunset-cruise",
    showMap: true,
    path: "/lake-austin-sunset-cruise",
    metaTitle: "Lake Austin Sunset Cruise | Public & Private Charters | Boat Bros ATX",
    metaDescription:
      "Lake Austin sunset cruises every evening. Public shared cruises + private charters. Captain included. Book your Lake Austin sunset cruise.",
    keywords: ["lake austin sunset cruise", "sunset cruise lake austin", "lake austin sunset boat"],
    heroTitle: "Lake Austin Sunset Cruise — Public & Private Captained Charters",
    heroSubtitle: "Lake Austin bluffs, coves & golden hour",
    heroIntroParagraph:
      "A Lake Austin sunset cruise puts you on calm water with hill country views as the sun drops. Boat Bros offers public tickets and private sunset charters — captain included.",
    overviewHeadline: "Why sunset on Lake Austin",
    overviewStory:
      "Lake Austin's narrow shape and tree-lined shores create standout sunset photos. Our captains route for light and calm water, not crowded open-lake traffic.",
    overviewSeoParagraphs: [
      "Searching city-wide? See our Austin sunset cruise page. This page focuses on Lake Austin routes, timing, and what makes evening trips here unique.",
    ],
    bookingExperienceSlug: "sunset",
    faq: [
      {
        question: "What's the best time for a Lake Austin sunset?",
        answer: "Times vary by season — book the slot shown on our calendar for the week you visit.",
      },
      {
        question: "Public vs private on Lake Austin?",
        answer: "Public shares the boat with other guests; private is only your group.",
      },
      {
        question: "Can we swim on a sunset cruise?",
        answer: "Depends on cruise type and conditions — ask when booking or check your confirmation.",
      },
      {
        question: "Is this the same as sunset cruise Austin?",
        answer: "Same boats and captains — this page emphasizes Lake Austin-specific scenery and departures.",
      },
      {
        question: "How do I book?",
        answer: "Select sunset experience on our online calendar.",
      },
    ],
    relatedExperiences: [
      { href: "/sunset-cruise-austin", title: "Sunset cruise Austin" },
      { href: "/lake-austin-boat-rentals", title: "Lake Austin boat rentals" },
      { href: "/experiences/sunset", title: "Sunset experience" },
    ],
    finalCtaHeadline: "Book your Lake Austin sunset cruise",
    serviceSchemaName: "Lake Austin Sunset Cruise",
    serviceSchemaType: "Sunset Cruise",
  }),

  "lake-austin-vs-lake-travis-boat-rental": page({
    id: "lake-austin-vs-lake-travis-boat-rental",
    layoutVariant: "guide",
    path: "/lake-austin-vs-lake-travis-boat-rental",
    metaTitle: "Lake Austin vs Lake Travis Boat Rental | Which Is Better? | Boat Bros ATX",
    metaDescription:
      "Comparing Lake Austin vs Lake Travis for boat rentals? We break down calm water, scenery, access, and pricing. See why Lake Austin wins for private charters.",
    keywords: ["lake austin vs lake travis boat rental", "austin boat rentals lake travis", "boat rental austin tx lake travis"],
    heroTitle: "Lake Austin vs Lake Travis for Boat Rentals: Which Is Better?",
    heroSubtitle: "Calm water, access & captained charters compared",
    heroIntroParagraph:
      "Choosing between Lake Austin and Lake Travis for a boat rental? Both are popular, but they're different lakes. Here's an honest comparison for Austin visitors and locals planning a captained charter.",
    overviewHeadline: "Quick comparison",
    overviewStory:
      "Lake Austin is closer to downtown, generally calmer, and ideal for private captained pontoons and wake sessions. Lake Travis is larger, busier, and farther west — great for some crowds, but a different trip.",
    overviewSeoParagraphs: [
      "For private celebrations, swimming, and captained experiences without a long drive, Lake Austin is our recommendation — that's where Boat Bros operates exclusively.",
      "Lake Travis can make sense if you're already staying lakeside west of Austin and want a huge open reservoir. For most Austin trips, Lake Austin's access and calm water win.",
    ],
    schemaVariant: "article",
    experienceCards: undefined,
    bestForItems: undefined,
    faq: [
      {
        question: "Which lake is closer to downtown Austin?",
        answer: "Lake Austin is significantly closer — typically 15–25 minutes vs 45+ for much of Lake Travis.",
      },
      {
        question: "Which lake is calmer for swimming?",
        answer: "Lake Austin is generally calmer with more no-wake coves; Lake Travis is larger and can be rougher with wind and traffic.",
      },
      {
        question: "Where does Boat Bros operate?",
        answer: "We offer captained charters on Lake Austin only.",
      },
      {
        question: "Can I party on both lakes?",
        answer: "Both have party scenes; we specialize in private captained pontoons on Lake Austin rather than shared barges.",
      },
      {
        question: "Should I book Lake Austin for a bachelorette?",
        answer: "Yes — see our bachelorette party boat page for Lake Austin-specific planning.",
      },
    ],
    relatedArticles: [
      { href: "/blog/lake-austin-vs-lake-travis-boat-rental", title: "Full comparison on The Dock", excerpt: "Extended blog version of this guide." },
      { href: "/blog/lake-austin-boat-rental-guide", title: "Lake Austin boat rental guide", excerpt: "Plan your Lake Austin charter." },
    ],
    relatedExperiences: [
      { href: "/lake-austin-boat-rentals", title: "Lake Austin boat rentals" },
      { href: "/boat-rental-austin", title: "Boat rental Austin" },
    ],
    finalCtaHeadline: "Book on Lake Austin",
    finalCtaSecondaryCta: "Lake Austin boat rentals",
    finalCtaSecondaryHref: "/lake-austin-boat-rentals",
    serviceSchemaName: "Lake Austin vs Lake Travis Boat Rental",
    serviceSchemaType: "Article",
  }),
};

export function getSeoLandingPage(id: SeoLandingPageId): SeoLandingPageConfig {
  return SEO_LANDING_PAGES[id];
}

export function buildSeoLandingEventOverrides(
  config: SeoLandingPageConfig,
  experienceCards?: import("@/components/experience/SeoExperienceCardsSection").SeoExperienceCardRich[],
): LakeAustinPontoonLayoutEventOverrides {
  const media = getSeoLandingMedia(config.id);
  return {
    heroTitle: config.heroTitle,
    heroSubtitle: config.heroSubtitle,
    heroIntroParagraph: config.heroIntroParagraph,
    heroImageFallback: media.fallbackHeroImage,
    heroImageAlt: media.heroAlt,
    heroBadge: media.heroBadge,
    heroHighlights: media.heroHighlights,
    useHeroVideo: media.useHeroVideo,
    overviewHeadline: config.overviewHeadline,
    overviewStory: config.overviewStory,
    overviewSeoParagraphs: config.overviewSeoParagraphs,
    overviewTimeline: config.overviewTimeline,
    faqItems: config.faq,
    finalCtaHeadline: config.finalCtaHeadline,
    finalCtaSecondaryCta: config.finalCtaSecondaryCta,
    finalCtaSecondaryHref: config.finalCtaSecondaryHref,
    trustStripItems: config.trustStripItems,
    experienceCards: experienceCards,
    showMap: config.showMap,
    showPricingOverview: config.showPricingOverview,
    showExperiencePicker: shouldShowExperiencePicker(config.id),
    pricingSubtext: config.pricingSubtext,
    bestForItems: config.bestForItems,
    comparisonRows: config.comparisonRows,
    comparisonLeftHeading: config.comparisonLeftHeading,
    comparisonRightHeading: config.comparisonRightHeading,
    comparisonHeadline: config.comparisonHeadline,
    relatedArticles: getLiveRelatedArticles(config.id),
    relatedExperiences: config.relatedExperiences,
    breadcrumbs: config.breadcrumbs ?? [
      { name: "Home", href: "/" },
      { name: config.breadcrumbCurrentName, href: config.path },
    ],
  };
}
