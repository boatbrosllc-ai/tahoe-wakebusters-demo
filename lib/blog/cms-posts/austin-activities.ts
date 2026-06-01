import { blocks, coverImage, type CmsBlogPostSeed } from "./helpers";

const b = blocks("activities");

export const austinActivities: CmsBlogPostSeed = {
  slug: "austin-activities",
  title: "Austin Activities: A Category-by-Category Guide to What to Do",
  excerpt:
    "Explore Austin activities by category — water sports, outdoor adventures, nightlife, food, family fun, and group experiences. The structured guide to doing Austin right.",
  coverImage: coverImage("/photos/IMG_3160.webp", "Group enjoying Austin water activities on Lake Austin"),
  seo: {
    metaTitle: "Austin Activities: The Complete Category Guide (2026)",
    metaDescription:
      "Explore Austin activities by category — water sports, outdoor adventures, nightlife, food, family fun, and group experiences. The structured guide to doing Austin right.",
    canonicalUrl: "https://boatbrosatx.com/blog/austin-activities",
    focusKeyword: "Austin activities",
    robotsIndex: true,
    robotsFollow: true,
  },
  taxonomy: { categories: ["austin-events"], tags: ["austin", "activities", "categories", "guide", "lake-austin"] },
  content: [
    b.keyTakeaways([
      "Austin activities organize cleanly by category — water, outdoor, nightlife, food, family, and groups.",
      "Water activities lead commercially and experientially: Lake Austin boat days, wakesurfing, sunset cruises.",
      "Use this structured guide alongside narrative posts like things to do in Austin for different search intents.",
      "Summer lake bookings need lead time; many land activities are walk-up friendly.",
    ]),
    b.p(
      "Austin activities span every category — but planning gets easier when you pick a lane first. This category-by-category guide maps water sports, outdoor adventures, nightlife, food, family fun, and group experiences so you can build a trip without scrolling endless listicles. For a narrative visitor guide, see [things to do in Austin](/blog/things-to-do-in-austin); for vibe-focused picks, [fun things to do in Austin](/blog/fun-things-to-do-in-austin)."
    ),
    b.h2("Water Activities in Austin"),
    b.h3("Lake Austin Boat Rentals and Charters"),
    b.p(
      "The flagship Austin water activity. [Boat rental Austin](/boat-rental-austin) covers captained pontoons, wake boats, and ticketed sunset cruises — all on Lake Austin with no guest license required."
    ),
    b.h3("Wakesurfing and Wake Boating"),
    b.p(
      "Dedicated wake boat sessions for [wakesurfing Austin](/wakesurfing-austin), wakeboarding, and tubing. [Wake boat rental Austin](/wake-boat-rental-austin) reserves the whole boat for your group; [Wednesday Wakesurf Club](/wakesurf-club-austin) sells individual seats."
    ),
    b.h3("Sunset Cruises"),
    b.p(
      "Public evening cruises and private sunset charters — shorter than a full pontoon day, strong on photos and golden hour."
    ),
    b.h3("Kayaking and Paddleboarding"),
    b.p(
      "Lady Bird Lake downtown and select Lake Austin launch points. Lower cost, higher effort — good half-day add-on."
    ),
    b.h2("Outdoor Activities in Austin"),
    b.p(
      "Barton Springs, Barton Creek Greenbelt, Zilker Park, McKinney Falls, and Wild Basin cover land-based outdoor Austin activities. Full depth: [outdoor activities in Austin](/blog/outdoor-things-to-do-in-austin)."
    ),
    b.h2("Nightlife Activities in Austin"),
    b.p(
      "Live music on 6th and Rainey, rooftop bars, ACL Live and Stubb's concerts, comedy clubs, and dance venues. Peak Thursday–Saturday; reserve dinner before bar crawls."
    ),
    b.h2("Food and Dining Activities in Austin"),
    b.p(
      "BBQ lines (Franklin, La Barbecue, Terry Black's), South Congress tacos, food halls, cooking classes, and Hill Country wine tastings. Food is an activity in Austin — plan one anchor meal per day."
    ),
    b.h2("Family Activities in Austin"),
    b.p(
      "Thinkery Children's Museum, Barton Springs family swim, Zilker kite hill, Bullock Texas State History Museum, and captained family pontoon days. Parent guide: [family friendly things to do in Austin](/blog/family-friendly-things-to-do-in-austin)."
    ),
    b.h2("Group Activities in Austin"),
    b.h3("Birthday Activities in Austin"),
    b.p(
      "Private pontoon charters, [Austin party boat rentals](/austin-party-boat-rentals), escape rooms, axe throwing, and Rainey bar crawls scale for groups. Lake day first, nightlife second is the usual winning stack."
    ),
    b.p(
      "Corporate outings and reunions follow the same pattern — one anchor water experience plus one structured evening."
    ),
    b.h2("Seasonal Austin Activities"),
    b.ul([
      "Spring: Wildflowers, comfortable lake days, outdoor festivals",
      "Summer: Peak lake season — book charters early; Barton Springs daily",
      "Fall: Best overall activity weather; ACL and F1 crowds",
      "Winter: Mild hiking, holiday markets, quieter lake weekdays",
    ]),
    b.h2("Austin Activities by Budget (Free, $, $$)"),
    b.table(
      ["Budget", "Activities"],
      [
        ["Free", "Greenbelt hike, Zilker, Lady Bird trail, Capitol grounds"],
        ["$", "Barton Springs, museum days (some free hours), food hall lunch"],
        ["$$", "Sunset cruise tickets, kayaking, comedy show, nice dinner"],
        ["$$$", "Private pontoon charter, wake boat, fine dining, hotel rooftop"],
      ]
    ),
    b.faq([
      {
        q: "What are the most popular activities in Austin?",
        a: "Lake Austin boat days, live music, BBQ, Barton Springs, and Rainey Street bar-hopping top visitor and local lists.",
      },
      {
        q: "What activities are free in Austin?",
        a: "Greenbelt hiking, Zilker Park, Lady Bird Lake trail, and many outdoor parks. Live music happy hours often have no cover early.",
      },
      {
        q: "What are the best water activities in Austin?",
        a: "Captained Lake Austin pontoon charters, wake boat watersports, public sunset cruises, Lady Bird kayaking, and Barton Springs swimming.",
      },
      {
        q: "What are good group activities in Austin?",
        a: "Private boat charters, Wakesurf Club, escape rooms, axe throwing, and Rainey crawls. The lake scales best for 8+ people.",
      },
      {
        q: "What are the best activities in Austin in summer?",
        a: "Lake boat days, Barton Springs, early Greenbelt hikes, indoor museums midday, and evening sunset cruises. Book water activities first.",
      },
    ]),
    b.cta(
      "Austin's top water activity is a Lake Austin boat day",
      "Pontoon, wake boat, or sunset cruise — captain included. [Book a boat rental in Austin](/boat-rental-austin)."
    ),
  ],
};
