import { blocks, coverImage, type CmsBlogPostSeed } from "./helpers";

const b = blocks("outdoor-austin");

export const outdoorThingsToDoInAustin: CmsBlogPostSeed = {
  slug: "outdoor-things-to-do-in-austin",
  title: "Outdoor Things to Do in Austin: Lake Days, Trails & Water Activities",
  excerpt:
    "The best outdoor things to do in Austin — Lake Austin boat days, Barton Springs, Greenbelt hiking, Lady Bird Lake paddleboarding, and more. A local's outdoor guide.",
  coverImage: coverImage("/photos/IMG_5116%202.webp", "Pontoon boat on Lake Austin — outdoor water activity in Austin"),
  seo: {
    metaTitle: "Outdoor Things to Do in Austin: Lake Days, Trails & Water Activities (2026)",
    metaDescription:
      "The best outdoor things to do in Austin — Lake Austin boat days, Barton Springs, Greenbelt hiking, Lady Bird Lake paddleboarding, and more. A local's outdoor guide.",
    canonicalUrl: "https://boatbrosatx.com/blog/outdoor-things-to-do-in-austin",
    focusKeyword: "outdoor things to do in Austin",
    robotsIndex: true,
    robotsFollow: true,
  },
  taxonomy: { categories: ["austin-events"], tags: ["austin", "outdoor", "hiking", "lake-austin", "water"] },
  content: [
    b.keyTakeaways([
      "Outdoor things to do in Austin center on water — Lake Austin boat days lead the list for groups and visitors.",
      "Barton Springs and the Greenbelt are year-round local favorites; Lady Bird Lake adds downtown paddling.",
      "Summer means early starts for trails; lake days work all day with shade and swim stops.",
      "McKinney Falls and Wild Basin add variety beyond the usual downtown-adjacent spots.",
    ]),
    b.p(
      "Outdoor things to do in Austin are why locals stay — a lake inside the city, spring-fed pools, miles of greenbelt, and paddle routes under the downtown skyline. This guide focuses on water activities, trails, parks, and seasonal tips for the best outdoor things to do in Austin without a long drive to Hill Country. For the broader activity umbrella, see [things to do in Austin](/blog/things-to-do-in-austin)."
    ),
    b.h2("Water Activities — The Best Outdoor Things to Do in Austin"),
    b.h3("Lake Austin Boat Day (Pontoon, Wake Boat, Sunset Cruise)"),
    b.p(
      "Lake Austin is Austin's top outdoor water destination — constant water level, limestone bluffs, and swim coves 15–25 minutes from downtown. [Lake Austin boat rentals](/lake-austin-boat-rentals) include captained pontoons for groups, [wake boat rental Austin](/wake-boat-rental-austin) for watersports, and [sunset cruise Austin](/sunset-cruise-austin) for shorter scenic trips. No license needed on captained charters. Planning depth: [Lake Austin boat guide](/blog/lake-austin-boat-guide). [Lake Austin pontoon rentals](/experiences/lake-austin-pontoon) are the default for swimming and celebrations."
    ),
    b.h3("Lady Bird Lake Kayaking and Paddleboarding"),
    b.p(
      "Rent kayaks or paddleboards from downtown launch points and paddle under Congress Avenue bridges. Best spring and fall; start early in summer."
    ),
    b.h3("Barton Springs Pool"),
    b.p(
      "Spring-fed pool in Zilker Park — 68–70°F year-round. Iconic Austin outdoor swim; cash/card entry; combine with Zilker picnic or trail time."
    ),
    b.h3("Swimming Holes and Coves on Lake Austin"),
    b.p(
      "Captains anchor in no-wake coves for swimming and lily pad time. See [best coves and swimming spots on Lake Austin](/blog/best-coves-spots-lake-austin-pontoon-swimming) for what to expect on a pontoon day."
    ),
    b.h2("Hiking and Trails in Austin"),
    b.h3("Barton Creek Greenbelt"),
    b.p(
      "Shaded trails and swimming holes when water flows — Gus Fruh and Twin Falls are popular access points. Check conditions after heavy rain; wear sturdy shoes."
    ),
    b.h3("McKinney Falls State Park"),
    b.p(
      "Waterfalls and trails southeast of downtown — good half-day trip with swimming when flow allows. State park entry fee applies."
    ),
    b.h3("Wild Basin Wilderness Preserve"),
    b.p(
      "Quieter trails in West Austin — less crowded than the Greenbelt on weekends. Good for birding and shaded walks."
    ),
    b.h2("Parks and Green Spaces"),
    b.h3("Zilker Park"),
    b.p(
      "Kite hill, picnic lawns, Barton Springs access, and ACL Festival grounds (seasonal). Central hub for outdoor Austin days."
    ),
    b.h3("Mayfield Park and Nature Preserve"),
    b.p(
      "Peacocks, ponds, and short garden walks — low-key outdoor stop before or after west-side lake plans."
    ),
    b.h2("Outdoor Things to Do in Austin by Season"),
    b.ul([
      "Spring: Greenbelt wildflowers, comfortable lake days, Lady Bird paddling",
      "Summer: Early hikes, all-day lake charters, Barton Springs cooldown",
      "Fall: Best overall outdoor season — lake, trails, and patio weather",
      "Winter: Mild hiking, quiet lake weekdays, fewer crowds at Barton Springs",
    ]),
    b.h2("Outdoor Group Activities in Austin"),
    b.p(
      "Private captained pontoons scale best for 8–14 people — swimming, music, and photos in one trip. [Wakesurfing Austin](/wakesurfing-austin) on a dedicated wake boat suits active groups. Compare options in [fun things to do in Austin](/blog/fun-things-to-do-in-austin)."
    ),
    b.h2("Quick-Reference Outdoor Activity Table"),
    b.table(
      ["Activity", "Type", "Drive from downtown", "Cost"],
      [
        ["Lake Austin boat day", "Water", "15–25 min", "$$–$$$"],
        ["Barton Springs", "Swim", "10 min", "$"],
        ["Greenbelt hike", "Trail", "10–20 min", "Free"],
        ["Lady Bird paddle", "Water", "Walkable", "$$"],
        ["McKinney Falls", "Trail + swim", "20 min", "$"],
        ["Zilker Park", "Park", "10 min", "Free–$"],
      ]
    ),
    b.faq([
      {
        q: "What are the best outdoor things to do in Austin in summer?",
        a: "Lake Austin boat days, Barton Springs, early Greenbelt hikes, Lady Bird paddling at dawn, and evening sunset cruises. Avoid midday trail exposure June–August.",
      },
      {
        q: "Are there free outdoor activities in Austin?",
        a: "Greenbelt hiking, Zilker Park, Lady Bird Lake trail, and Mayfield Park are free or low-cost. Barton Springs has a modest entry fee.",
      },
      {
        q: "What is the best lake for outdoor activities near Austin?",
        a: "Lake Austin for captained charters, calm coves, and proximity to downtown. Lake Travis is larger and farther west — different trip profile.",
      },
      {
        q: "Is Barton Creek Greenbelt worth visiting?",
        a: "Yes when water is flowing — swimming holes and shaded trails are a local favorite. Skip after extended dry spells or muddy post-storm conditions.",
      },
      {
        q: "Can you swim in Lake Austin?",
        a: "Yes — captains anchor in coves for swimming on pontoon charters. Follow captain guidance on conditions and no-swim zones.",
      },
    ]),
    b.cta(
      "Lake Austin is Austin's top outdoor water destination",
      "Book a captained boat day or sunset cruise — no experience needed. [See Lake Austin boat rentals](/lake-austin-boat-rentals)."
    ),
  ],
};
