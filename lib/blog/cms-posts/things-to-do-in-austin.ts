import { blocks, coverImage, type CmsBlogPostSeed } from "./helpers";

const b = blocks("things-austin");

export const thingsToDoInAustin: CmsBlogPostSeed = {
  slug: "things-to-do-in-austin",
  title: "Things to Do in Austin: The Complete Activity Guide",
  excerpt:
    "Discover the best things to do in Austin — outdoor adventures, live music, lake days, food, and family activities. The complete guide to Austin activities for every visitor.",
  coverImage: coverImage("/photos/IMG_5116%202.webp", "Pontoon boat on Lake Austin — a top thing to do in Austin"),
  seo: {
    metaTitle: "Things to Do in Austin: Complete Guide to Activities & Attractions (2026)",
    metaDescription:
      "Discover the best things to do in Austin — outdoor adventures, live music, lake days, food, and family activities. The complete guide to Austin activities for every visitor.",
    canonicalUrl: "https://boatbrosatx.com/blog/things-to-do-in-austin",
    focusKeyword: "things to do in Austin",
    robotsIndex: true,
    robotsFollow: true,
  },
  taxonomy: { categories: ["austin-events"], tags: ["austin", "activities", "things-to-do", "travel", "guide"] },
  content: [
    b.keyTakeaways([
      "Things to do in Austin span lake days, live music, BBQ, museums, and outdoor adventures — this is the broadest umbrella guide.",
      "Lake Austin boat days are the top outdoor pick for first-time visitors.",
      "Use audience-specific guides (families, downtown, outdoor) linked below instead of one overwhelming list.",
      "Book weekend lake charters early; most other activities are more flexible.",
    ]),
    b.p(
      "Things to do in Austin fill a long list — but most trips come down to a few anchors: water, music, food, and one outdoor morning. This complete activity guide organizes the best things to do in Austin by category and links to deeper posts for families, downtown visitors, outdoor adventures, and nightlife. For a lighter, vibe-focused roundup, see [fun things to do in Austin](/blog/fun-things-to-do-in-austin)."
    ),
    b.h2("Outdoor Things to Do in Austin"),
    b.p(
      "Lake Austin leads the outdoor list — captained pontoons, wake boats, and sunset cruises with no boating experience needed. [Lake Austin boat rentals](/lake-austin-boat-rentals) put you on calm water with swim coves and Hill Country views 15–25 minutes from downtown. Barton Springs, the Greenbelt, and Lady Bird Lake kayaking round out the classics. Full outdoor depth: [outdoor things to do in Austin](/blog/outdoor-things-to-do-in-austin). [Lake Austin pontoon rentals](/experiences/lake-austin-pontoon) are the most popular charter type for groups."
    ),
    b.h2("Things to Do in Austin at Night"),
    b.p(
      "Live music on 6th Street and Rainey Street, rooftop bars, ACL Live and Stubb's concerts, and comedy clubs fill evening hours. Designate a ride or rideshare — downtown parking is tight on weekends."
    ),
    b.h2("Things to Do in Austin for Families"),
    b.p(
      "Barton Springs, Zilker Park, Thinkery Children's Museum, and captained family pontoon days on Lake Austin work across ages. Parent-focused guide: [family friendly things to do in Austin](/blog/family-friendly-things-to-do-in-austin)."
    ),
    b.h2("Things to Do in Austin for Adults"),
    b.p(
      "Nightlife-heavy groups and lake party days live in our [fun things to do in Austin for adults](/blog/fun-things-to-do-in-austin-for-adults) post — Rainey crawls, party boats, and group activities in depth."
    ),
    b.h2("Things to Do in Austin for Couples"),
    b.p(
      "Sunset cruises, private boat rides, rooftop cocktails, and reservation dinners stack into a strong couples weekend. Trip framework: [Austin weekend getaway](/blog/austin-weekend-getaway)."
    ),
    b.h2("Things to Do in Austin This Weekend"),
    b.p(
      "Last-minute options: public [sunset cruise Austin](/sunset-cruise-austin), Barton Springs, South Congress strolls, and walk-up live music. Boat charters need more lead time on summer Saturdays. General trip planning: [Austin weekend trip guide](/blog/austin-weekend-trip)."
    ),
    b.h2("Things to Do in Downtown Austin"),
    b.p(
      "Lady Bird Lake trail, Rainey and 6th nightlife, museums, and rooftop bars are walkable from downtown hotels. Lake Austin is an easy day trip — 15–20 minutes by car. Neighborhood guide: [things to do in downtown Austin](/blog/things-to-do-in-downtown-austin)."
    ),
    b.h2("Austin Attractions Worth Your Time"),
    b.p(
      "Landmarks and must-see sights — Barton Springs, the Texas State Capitol, South Congress, and Lake Austin from the water — differ from general activities. See our [Austin attractions](/blog/austin-attractions) guide for landmark-focused planning."
    ),
    b.h2("Austin Activities by Category"),
    b.table(
      ["Category", "Top pick", "Also see"],
      [
        ["Water", "Lake Austin boat day", "[Boat rental Austin](/boat-rental-austin)"],
        ["Outdoor", "Barton Springs + Greenbelt", "[Outdoor things to do in Austin](/blog/outdoor-things-to-do-in-austin)"],
        ["Nightlife", "Rainey Street + live music", "[Fun things for adults](/blog/fun-things-to-do-in-austin-for-adults)"],
        ["Food", "BBQ + South Congress tacos", "[Date ideas Austin](/blog/date-ideas-austin)"],
        ["Family", "Zilker + Thinkery", "[Family friendly guide](/blog/family-friendly-things-to-do-in-austin)"],
        ["Structured overview", "Category-by-category", "[Austin activities](/blog/austin-activities)"],
      ]
    ),
    b.faq([
      {
        q: "What are the top things to do in Austin for first-time visitors?",
        a: "Lake Austin boat day or sunset cruise, live music on Rainey or 6th, Franklin-style BBQ, Barton Springs, and a South Congress stroll cover the essentials in 2–3 days.",
      },
      {
        q: "What are free things to do in Austin?",
        a: "Greenbelt hiking, Zilker Park, Lady Bird Lake trail, Capitol grounds, and many live music happy hours. Barton Springs has a small entry fee.",
      },
      {
        q: "What are things to do in Austin at night?",
        a: "Rainey Street bar crawl, 6th Street live music, rooftop cocktails, ACL Live or Stubb's concerts, and comedy clubs.",
      },
      {
        q: "What are things to do in Austin in the summer?",
        a: "Lake Austin boat days, Barton Springs, early-morning Greenbelt hikes, indoor museums midday, and evening sunset cruises. Book lake charters early.",
      },
      {
        q: "What are things to do in Austin with kids?",
        a: "Barton Springs, Zilker Park, Thinkery Children's Museum, captained family pontoon on Lake Austin, and Bullock Texas State History Museum.",
      },
    ]),
    b.cta(
      "One of Austin's top outdoor activities is a Lake Austin boat day",
      "No experience needed — captained charters with swimming and music. [See Lake Austin boat rentals](/lake-austin-boat-rentals)."
    ),
  ],
};
