import { blocks, coverImage, type CmsBlogPostSeed } from "./helpers";

const b = blocks("downtown-austin");

export const thingsToDoInDowntownAustin: CmsBlogPostSeed = {
  slug: "things-to-do-in-downtown-austin",
  title: "Things to Do in Downtown Austin: A Neighborhood-by-Neighborhood Guide",
  excerpt:
    "Discover the best things to do in downtown Austin — walkable bars, live music, Lady Bird Lake, rooftop views, and day trips to Lake Austin. A neighborhood-by-neighborhood guide.",
  coverImage: coverImage("/photos/IMG_9647%202.webp", "Downtown Austin skyline view from Lady Bird Lake"),
  seo: {
    metaTitle: "Things to Do in Downtown Austin: Walkable Activities & Nightlife (2026)",
    metaDescription:
      "Discover the best things to do in downtown Austin — walkable bars, live music, Lady Bird Lake, rooftop views, and day trips to Lake Austin. A neighborhood-by-neighborhood guide.",
    canonicalUrl: "https://boatbrosatx.com/blog/things-to-do-in-downtown-austin",
    focusKeyword: "things to do in downtown Austin",
    robotsIndex: true,
    robotsFollow: true,
  },
  taxonomy: { categories: ["austin-events"], tags: ["austin", "downtown", "neighborhoods", "nightlife", "walkable"] },
  content: [
    b.keyTakeaways([
      "Things to do in downtown Austin cluster by neighborhood — Rainey, 6th, SoCo, and Red River each have distinct vibes.",
      "Lady Bird Lake trail and kayaking are walkable from most downtown hotels.",
      "Lake Austin is 15–20 minutes away — easy day trip for a boat day or sunset cruise.",
      "Weekend nights: rideshare beats parking for bar districts.",
    ]),
    b.p(
      "Things to do in downtown Austin reward walkers — live music districts, Lady Bird Lake trails, museums, and rooftop bars within minutes of most hotels. This neighborhood-by-neighborhood guide maps what is where, what is free, and how to add a Lake Austin day trip without leaving your downtown base. For city-wide activity planning, see [things to do in Austin](/blog/things-to-do-in-austin)."
    ),
    b.h2("Downtown Austin Neighborhoods — What's Where"),
    b.h3("Rainey Street"),
    b.p(
      "Converted bungalow bars with patios — festive, walkable, popular for groups and visitors. Start earlier for seating; lines grow after 9 PM on weekends."
    ),
    b.h3("6th Street (Dirty, East, West)"),
    b.p(
      "Dirty 6th (lower) is loud and tourist-heavy with cover bands. East 6th skews local and music-focused. West 6th is slightly dressier bars and clubs."
    ),
    b.h3("South Congress (SoCo)"),
    b.p(
      "South of the river but walkable from downtown via Congress Avenue bridge. Boots, murals, tacos, and boutique shopping — strong morning and afternoon district."
    ),
    b.h3("Red River Cultural District"),
    b.p(
      "Mohawk, Empire Control Room, and nearby venues — ticketed shows and local acts. Good alternative to 6th Street bar crawl."
    ),
    b.h2("Outdoor Things to Do Near Downtown Austin"),
    b.h3("Lady Bird Lake Kayaking and Hike-and-Bike Trail"),
    b.p(
      "The Ann and Roy Butler Hike-and-Bike Trail loops Lady Bird Lake — run, walk, or rent kayaks and paddleboards from downtown launches. Flat, scenic, and free to access."
    ),
    b.h3("Barton Springs Pool (10 min from downtown)"),
    b.p(
      "Short drive or rideshare to Zilker — spring-fed pool open year-round. Combine with Zilker picnic before evening downtown plans."
    ),
    b.h3("Lake Austin Day Trip from Downtown"),
    b.p(
      "Lake Austin is 15–20 minutes by car — add a captained pontoon day or [sunset cruise Austin](/sunset-cruise-austin) without changing hotels. A [boat ride Austin](/boat-ride-austin) works for visitors who want a scenic charter without driving the boat. See [Lake Austin boat rentals](/lake-austin-boat-rentals) for charter types."
    ),
    b.h2("Live Music and Nightlife Downtown"),
    b.p(
      "6th Street cover bands, Rainey patio crawls, ACL Live and Stubb's ticketed shows, and Red River clubs cover most tastes. Check who's playing the week you visit — a two-set small venue night often beats a generic crawl."
    ),
    b.h2("Food and Dining Downtown Austin"),
    b.p(
      "Fareground and downtown food halls offer variety for groups. Reservation restaurants on 2nd and Congress suit pre-show dinners. Waterfront and lake-adjacent dining pairs with a boat day — [waterfront restaurants near Austin](/blog/best-restaurants-lake-austin-boat-day)."
    ),
    b.h2("Museums and Culture Downtown"),
    b.p(
      "Bullock Texas State History Museum, The Contemporary Austin, and Texas State Capitol tours add indoor options during heat or rain. Blanton Museum is a short walk from campus west of downtown."
    ),
    b.h2("Things to Do in Downtown Austin at Night"),
    b.p(
      "Rainey crawl, rooftop sunset hour, 6th Street live music, or a ticketed show at ACL Live. Designate a ride — parking and DUI enforcement are real on weekend nights."
    ),
    b.h2("Things to Do in Downtown Austin for Free"),
    b.p(
      "Lady Bird Lake trail, Congress Avenue bridge bat viewing (seasonal), Capitol grounds, street art on East Side walks, and early happy hours with no cover on live music."
    ),
    b.faq([
      {
        q: "What is there to do in downtown Austin on foot?",
        a: "Rainey and 6th bar districts, Lady Bird Lake trail, SoCo walk via Congress bridge, museums, and rooftop bars — most downtown hotels sit within 15 minutes walk of these.",
      },
      {
        q: "Is downtown Austin walkable?",
        a: "Yes for core districts — Rainey, 6th, Lady Bird trail, and SoCo via the bridge. Use rideshare for East Side venues or late-night returns across I-35.",
      },
      {
        q: "What are free things to do in downtown Austin?",
        a: "Lady Bird trail, Capitol grounds, bridge views, street art walks, and many early live music sets without cover.",
      },
      {
        q: "What is the best area of downtown Austin for nightlife?",
        a: "Rainey for patio group vibe; 6th for loud live music; West 6th for slightly dressier bars; Red River for ticketed shows.",
      },
      {
        q: "How far is Lake Austin from downtown Austin?",
        a: "Typically 15–20 minutes by car depending on traffic and launch point — easy half-day or sunset trip without changing hotels.",
      },
    ]),
    b.cta(
      "Lake Austin is just 15–20 minutes from downtown",
      "Add a boat day or sunset cruise to your downtown trip. [See boat ride options in Austin](/boat-ride-austin)."
    ),
  ],
};
