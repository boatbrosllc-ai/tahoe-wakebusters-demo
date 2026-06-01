import { blocks, coverImage, type CmsBlogPostSeed } from "./helpers";

const b = blocks("attractions");

export const austinAttractions: CmsBlogPostSeed = {
  slug: "austin-attractions",
  title: "Austin Attractions: The Must-See Landmarks and Experiences",
  excerpt:
    "Explore the best Austin attractions — from Lake Austin boat days and Barton Springs to live music venues, museums, and iconic food spots. The complete visitor's guide.",
  coverImage: coverImage("/photos/IMG_3160.webp", "Lake Austin scenery — one of Austin's top natural attractions"),
  seo: {
    metaTitle: "Austin Attractions: Must-See Landmarks & Experiences (2026)",
    metaDescription:
      "Explore the best Austin attractions — from Lake Austin boat days and Barton Springs to live music venues, museums, and iconic food spots. The complete visitor's guide.",
    canonicalUrl: "https://boatbrosatx.com/blog/austin-attractions",
    focusKeyword: "Austin attractions",
    robotsIndex: true,
    robotsFollow: true,
  },
  taxonomy: { categories: ["austin-events"], tags: ["austin", "attractions", "landmarks", "tourism", "sightseeing"] },
  content: [
    b.keyTakeaways([
      "Austin attractions mix natural landmarks (Lake Austin, Barton Springs) with cultural icons (live music, BBQ, SoCo).",
      "Experiencing Lake Austin from a boat is the best way to see the lake as an attraction — not just a map pin.",
      "Book boat days and popular restaurants ahead; many land attractions are walk-up friendly.",
      "Attractions differ from general activities — this guide focuses on must-see landmarks and sights.",
    ]),
    b.p(
      "Austin attractions are what tourists photograph and locals brag about — the lake, the springs, the music districts, and the food lines worth the wait. This guide maps must-see landmarks and book-ahead experiences, with Lake Austin from the water as the natural centerpiece. For broader activity planning, see [things to do in Austin](/blog/things-to-do-in-austin) and the structured [Austin activities guide](/blog/austin-activities)."
    ),
    b.h2("Natural Attractions in Austin"),
    b.h3("Lake Austin"),
    b.p(
      "Lake Austin is the city's defining natural attraction — limestone bluffs, constant water level, and coves ten miles from the Capitol. The best way to experience it is on the water: captained pontoon day, wake session, or [Lake Austin sunset cruise](/lake-austin-sunset-cruise). Land viewpoints exist, but the lake is built to be seen from a boat."
    ),
    b.h3("Barton Springs Pool"),
    b.p(
      "Spring-fed pool in Zilker Park — 68–70°F year-round, iconic Austin swim. Entry fee; cash/card accepted."
    ),
    b.h3("Barton Creek Greenbelt"),
    b.p(
      "Miles of trail and seasonal swimming holes — local landmark for hikers and cliff jumpers when water flows."
    ),
    b.h3("Lady Bird Lake"),
    b.p(
      "Downtown reservoir with hike-and-bike trail and Congress Avenue bridge views — including seasonal bat flights."
    ),
    b.h2("Cultural and Music Attractions in Austin"),
    b.h3("6th Street Live Music District"),
    b.p(
      "Historic entertainment district — cover bands, bars, and street energy. Tourist-heavy but genuinely Austin at night."
    ),
    b.h3("ACL Live at The Moody Theater"),
    b.p(
      "Premier venue for touring acts and Austin City Limits tapings — ticketed shows worth planning around."
    ),
    b.h3("Stubb's Amphitheater"),
    b.p(
      "Outdoor amphitheater with BBQ — concerts under the Austin skyline. Seasonal calendar; buy tickets early for popular acts."
    ),
    b.h2("Museum Attractions in Austin"),
    b.h3("Blanton Museum of Art"),
    b.p(
      "UT campus museum with strong permanent collection and rotating exhibits — air-conditioned landmark for hot afternoons."
    ),
    b.h3("Bullock Texas State History Museum"),
    b.p(
      "Texas history, IMAX, and Capitol-adjacent location — good for visitors who want context on the state."
    ),
    b.h2("Food Attractions in Austin"),
    b.h3("Franklin Barbecue"),
    b.p(
      "World-famous brisket line — arrive early or use online ordering where available. It is an attraction and a meal."
    ),
    b.h3("South Congress Avenue"),
    b.p(
      "SoCo is a landmark strip — boots, murals, food trucks, and the \"I love you so much\" mural. Walkable attraction unto itself."
    ),
    b.h2("Iconic Austin Experiences Worth Booking Ahead"),
    b.h3("Lake Austin Boat Day"),
    b.p(
      "Book captained charters before restaurants and hotels on summer weekends. [Boat rental Austin](/boat-rental-austin) options include pontoon, wake boat, and [Lake Austin pontoon rentals](/experiences/lake-austin-pontoon). Planning: [Lake Austin sunset cruise guide](/blog/lake-austin-sunset-cruise-guide) and [outdoor things to do in Austin](/blog/outdoor-things-to-do-in-austin)."
    ),
    b.h3("Sunset Cruise on Lake Austin"),
    b.p(
      "Public tickets or private charter — golden hour on the water. Shorter commitment than a full pontoon day; strong for first-time visitors. [Sunset cruise Austin](/sunset-cruise-austin) city-wide page covers options."
    ),
    b.h2("Austin Attractions Map and Logistics"),
    b.p(
      "Cluster by geography: downtown landmarks (Capitol, Lady Bird, 6th) in one day; Zilker and Barton Springs adjacent; Lake Austin west via 15–20 minute drive. Rideshare downtown on weekend nights; rent a car only for Hill Country side trips."
    ),
    b.faq([
      {
        q: "What are the top attractions in Austin for first-time visitors?",
        a: "Lake Austin from a boat, Barton Springs, live music on 6th or Rainey, South Congress, Franklin BBQ, and the Texas State Capitol.",
      },
      {
        q: "What is Austin most known for?",
        a: "Live music, Lake Austin and outdoor culture, BBQ and Tex-Mex food, and a laid-back creative vibe — \"Keep Austin Weird\" is the shorthand.",
      },
      {
        q: "Are there free attractions in Austin?",
        a: "Texas State Capitol tours, Lady Bird Lake trail, Zilker Park, Congress bridge views, and Greenbelt hiking. Barton Springs has a small fee.",
      },
      {
        q: "What is the most unique attraction in Austin?",
        a: "Barton Springs' year-round spring-fed pool and experiencing Lake Austin by captained boat — both are distinctly Austin, not generic theme-park fare.",
      },
      {
        q: "How many days do you need to see Austin's main attractions?",
        a: "Two full days covers lake, Barton Springs, SoCo, and one music night. Three days adds museums, Greenbelt, and a second food anchor.",
      },
    ]),
    b.cta(
      "Lake Austin is one of Austin's top natural attractions",
      "Experience it on a captained boat day or sunset cruise. [See boat rental options](/boat-rental-austin)."
    ),
  ],
};
