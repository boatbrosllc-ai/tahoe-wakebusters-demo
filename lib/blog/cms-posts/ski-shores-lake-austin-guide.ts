import { blocks, coverImage, type CmsBlogPostSeed } from "./helpers";
import { skiShoresCafe } from "@/content/lake-austin-places";

const b = blocks("ski-shores");

const SKI_SHORES_URL = "https://skishoresaustin.com";
const STATESMAN_PATIO_GUIDE =
  "https://www.statesman.com/story/entertainment/dining/2023/05/26/best-patio-restaurants-austin-texas-outdoor-dining/70245671007/";

const QUICK_ANSWER_ROWS: string[][] = [
  [
    "What is Ski Shores?",
    "Ski Shores Café — a Lake Austin waterfront restaurant since 1954, now part of McGuire Moorman Lambert Hospitality",
  ],
  [
    "Where is it?",
    "2905 Pearce Rd, Austin, TX 78730 ([official site](" + SKI_SHORES_URL + "))",
  ],
  ["Is it on Lake Austin?", "Yes — waterfront on Lake Austin along Pearce Road"],
  [
    "Can you boat there?",
    "Yes — Ski Shores is closely tied to boating culture; confirm current dock and access details directly with the restaurant",
  ],
  [
    "Good for groups?",
    "Yes — relaxed patio, burgers and tacos, casual lake-day atmosphere; great for families and friend groups",
  ],
  [
    "Best way to visit",
    "Captained [Lake Austin boat rental](/lake-austin-boat-rentals) with Ski Shores as a planned waterfront stop",
  ],
];

export const skiShoresLakeAustinGuide: CmsBlogPostSeed = {
  slug: "ski-shores-lake-austin-guide",
  title: "Ski Shores Austin Guide: Visiting by Boat on Lake Austin",
  excerpt:
    "Ski Shores Café at 2905 Pearce Rd on Lake Austin has been a waterfront staple since 1954 — now part of McGuire Moorman Lambert Hospitality. Here's how to visit by boat and pair it with a captained BoatBros ATX rental.",
  coverImage: coverImage(
    "/photos/IMG_9649.webp",
    "BoatBros ATX pontoon on Lake Austin near Ski Shores Austin"
  ),
  seo: {
    metaTitle: "Ski Shores Austin: Boat Access, Lake Austin Tips & Boat Day Guide",
    metaDescription:
      "Planning a trip to Ski Shores Austin? This BoatBros ATX guide covers visiting Ski Shores by boat, Lake Austin tips, nearby stops, and how to build a full boat day around it.",
    canonicalUrl: "https://boatbrosatx.com/blog/ski-shores-lake-austin-guide",
    focusKeyword: "ski shores austin",
    robotsIndex: true,
    robotsFollow: true,
  },
  taxonomy: {
    categories: ["boat-tips"],
    tags: ["lake-austin", "ski-shores", "waterfront-dining", "boat-rental", "guide"],
  },
  content: [
    b.quickAnswer(
      "Ski Shores Austin Quick Answer",
      "Yes, you can visit Ski Shores by boat on Lake Austin. Ski Shores Café is at 2905 Pearce Rd, Austin, TX 78730 — a waterfront institution since 1954, now operated by McGuire Moorman Lambert Hospitality. The restaurant is closely tied to Austin boating culture; confirm current dock and access details directly with Ski Shores before you go. For most groups, the best way to visit is a captained [Lake Austin boat rental](/lake-austin-boat-rentals) with Ski Shores as a mid-day or post-cruise stop.",
      ["Question", "Quick Answer"],
      QUICK_ANSWER_ROWS
    ),
    b.keyTakeaways([
      "Ski Shores Café opened in 1954 and is now part of McGuire Moorman Lambert Hospitality — one of Lake Austin's longest-running waterfront restaurants.",
      "Located at 2905 Pearce Rd on Lake Austin — a different stretch from Hula Hut and Mozart's at Oyster Landing, but still easy to reach by boat.",
      "Closely tied to boating culture — confirm dock access and current policies directly with the restaurant before your visit.",
      "Best paired with a captained Lake Austin rental from BoatBros ATX — the boat day is the main event, Ski Shores is the highlight stop.",
    ]),
    b.p(
      "Ski Shores Café is one of the most recognizable waterfront stops on Lake Austin — a relaxed patio under tall trees, boats lining the dock, and the kind of burgers-and-tacos menu that fits perfectly in the middle of a lake day. This is an independent guide covering location, boat access, group planning, and how to build a Lake Austin itinerary around Ski Shores. BoatBros ATX offers captained Lake Austin rentals; we are not affiliated with Ski Shores — always confirm current dock, hours, and access policies directly with the restaurant."
    ),
    b.p(
      "Location and history facts below are sourced from [Ski Shores Café](" +
        SKI_SHORES_URL +
        ") and the [Austin American-Statesman patio guide](" +
        STATESMAN_PATIO_GUIDE +
        ")."
    ),
    // Preferred filename once uploaded: ski-shores-austin-by-boat-lake-austin.webp
    b.img(
      "/photos/IMG_5116%202.webp",
      "Ski Shores Austin by boat on Lake Austin",
      "A captained Lake Austin rental is the best way to build a full day around Ski Shores."
    ),
    b.h2("What Is Ski Shores?"),
    b.p(
      "Ski Shores Café is a Lake Austin waterfront restaurant that has been part of the lake scene since 1954. Now operated by McGuire Moorman Lambert Hospitality, it retains the relaxed, outdoor-patio feel that made it a local institution — burgers, tacos, cold drinks, and simple meals that hit the spot without slowing down your boat day. Ski Shores feels less like a formal restaurant and more like a gathering place for people spending the day on the water."
    ),
    b.h2("Where Is Ski Shores Austin?"),
    b.p(
      "Ski Shores is at 2905 Pearce Rd, Austin, TX 78730, on Lake Austin along the Pearce Road stretch — confirmed on [Ski Shores' official site](" +
        SKI_SHORES_URL +
        "). It sits on a different part of the lake from Hula Hut and Mozart's Coffee at Oyster Landing, but remains convenient for groups in West Austin, Tarrytown, and downtown who want lake access without driving to Lake Travis."
    ),
    b.mapEmbed(
      skiShoresCafe.mapEmbedSrc,
      "Ski Shores Cafe on Lake Austin — Google Maps",
      skiShoresCafe.googleMapsPlaceUrl,
      "Ski Shores Cafe at 2905 Pearce Rd on Lake Austin."
    ),
    b.h2("Is Ski Shores on Lake Austin?"),
    b.p(
      "Yes. Ski Shores Café is a waterfront restaurant on Lake Austin — not Lake Travis. The Pearce Road location puts it on the city-side reservoir with direct lake access, making it a natural stop for boaters cruising the central and west stretches of the lake."
    ),
    b.h2("Can You Boat to Ski Shores?"),
    b.p(
      "Yes — Ski Shores is closely tied to Austin boating culture and has long been a destination for lake-goers arriving by boat. Dock space, hours, and access details can change with weather, events, and demand, so treat Ski Shores as a planned stop within a broader boat itinerary rather than the entire plan. Confirm current dock and access policies directly with the restaurant before your visit. A captained rental handles navigation and timing; you focus on the group."
    ),
    b.h2("Best Way to Plan a Lake Austin Boat Day Around Ski Shores"),
    b.h3("Option 1: Boat First, Ski Shores After"),
    b.p(
      "For most groups, the boat should be the main event. Cruise, swim, and float first — then pull up at Ski Shores when the group is ready for food and drinks. This avoids rushing the rental and keeps energy high for the water portion of the day."
    ),
    b.ul([
      "Meet your captain and depart on your Lake Austin rental",
      "Cruise scenic shoreline and swim in a cove",
      "Head toward Ski Shores when the group is hungry",
      "Dock or tie up for patio dining, then continue cruising or return",
    ]),
    b.h3("Option 2: Ski Shores First, Boat After"),
    b.p(
      "A lunch-first plan works for families and casual groups with a late-morning boat start. Eat at Ski Shores, then meet your captain nearby — simple logistics and everyone is fed before swimming."
    ),
    b.ul([
      "Arrive at Ski Shores for lunch on the patio",
      "Walk off the dock and meet your captain at the BoatBros pickup",
      "Spend the afternoon cruising, swimming, and floating",
    ]),
    b.h3("Option 3: Sunset Cruise + Ski Shores"),
    b.p(
      "Late-afternoon cruising followed by an early dinner at Ski Shores is ideal for couples and smaller groups who want lake time plus waterfront dining. Confirm hours on the [official site](" +
        SKI_SHORES_URL +
        ") and dock availability for your date."
    ),
    b.ul([
      "Book a late-afternoon captained rental",
      "Cruise and swim during golden hour",
      "Dock at Ski Shores for dinner as the sun sets over the lake",
    ]),
    b.h2("Sample Ski Shores Boat Day Itinerary"),
    b.ul(
      [
        "11:30 AM — Meet captain at the BoatBros ATX dock",
        "12:00 PM — Depart on your Lake Austin rental",
        "12:30 PM — Scenic cruise along the shoreline",
        "1:30 PM — Swim and lily-pad stop in a cove",
        "2:30 PM — Head toward Ski Shores on Pearce Road",
        "3:30 PM — Dock for food and drinks on the patio, then return to the marina",
      ],
      true
    ),
    b.img(
      "/photos/IMG_3160.webp",
      "BoatBros ATX Lake Austin boat day near Ski Shores",
      "Meet your captain, cruise Lake Austin, then head toward Ski Shores."
    ),
    b.h2("Things to Do Near Ski Shores Austin"),
    b.h3("Book a Lake Austin Boat Rental"),
    b.p(
      "The best way to extend a Ski Shores visit is the lake itself. A captained [Lake Austin boat rental](/lake-austin-boat-rentals) turns one meal into a full day — swimming, music, coves, and skyline views included."
    ),
    b.h3("Cruise Lake Austin"),
    b.p(
      "Even without a restaurant stop, cruising Lake Austin delivers waterfront homes, limestone bluffs, swim coves, and West Austin scenery — the reason most visitors choose this lake over a longer drive."
    ),
    b.h3("Plan a Birthday or Group Day"),
    b.p(
      "One activity, one location, one memorable experience: book the boat, pick Ski Shores as your waterfront stop, and let the captain handle navigation. Over-planning stops is the fastest way to lose lake time."
    ),
    b.h3("Explore the Lake Austin Restaurant Scene"),
    b.p(
      "Ski Shores is one of several waterfront restaurants on Lake Austin. For a livelier Tex-Mex stop with free boat docks, see our guide to [Austin Hula Hut by boat](/blog/austin-hula-hut-lake-austin-guide). County Line on the Lake and Mozart's Coffee offer additional options on the same reservoir."
    ),
    b.h3("Make It Part of a Full Austin Weekend"),
    b.p(
      "Classic visitor arc: Friday live music, Saturday captained boat day with a Ski Shores stop, Sunday brunch downtown. Lake Austin sits close enough to central Austin that you do not sacrifice nightlife for water time."
    ),
    b.h2("Ski Shores vs Hula Hut: Which Lake Austin Stop Is Better?"),
    b.table(
      ["Category", "Ski Shores", "Hula Hut"],
      [
        ["Best for", "Relaxed patio, burgers and tacos, lake-day reset", "Tex-Mex, margaritas, lively dock-side dining"],
        ["Vibe", "Laid-back institution under the trees", "Colorful, energetic, dock-party feel"],
        ["Location", "2905 Pearce Rd — central Lake Austin", "3825 Lake Austin Blvd — Oyster Landing"],
        ["Best group type", "Families, casual crews, mid-day stops", "Birthdays, friend groups, bach parties"],
        ["Best boat-day use", "Mid-day meal or casual waterfront break", "Dock party meal or post-swim highlight"],
        ["Best time", "Lunch through early evening", "Lunch through late evening"],
      ]
    ),
    b.p(
      "Both are strong Lake Austin waterfront stops — the right choice depends on your group's vibe. For Hula Hut's docks, boat-side delivery, and Tex-Mex energy, see our [Austin Hula Hut by boat](/blog/austin-hula-hut-lake-austin-guide) guide."
    ),
    b.h2("Ski Shores vs Mozart's: Which Lake Austin Stop Is Better?"),
    b.table(
      ["Category", "Ski Shores", "Mozart's"],
      [
        ["Best for", "Full meals, burgers, tacos, lake-day lunch", "Coffee, dessert, quieter waterfront time"],
        ["Vibe", "Casual patio dining under trees", "Relaxed, scenic, coffee-house atmosphere"],
        ["Best group type", "Families, friend groups, casual lake days", "Couples, families, low-key afternoons"],
        ["Best boat-day use", "Mid-day meal stop", "Morning coffee or sunset dessert add-on"],
        ["Best time", "Lunch through early evening", "Morning, afternoon, or holiday light displays"],
      ]
    ),
    b.h2("Ski Shores vs Lake Travis Restaurants"),
    b.table(
      ["Category", "Lake Austin / Ski Shores Area", "Lake Travis"],
      [
        ["Distance from central Austin", "~15–25 min to docks", "~35–55+ min to marinas (traffic)"],
        ["Best for", "City-based groups, captained charters", "Open-water days, west-side stays"],
        ["Group planning", "Easy dock stops + same-day nightlife", "Often a full-day commitment"],
        ["Restaurant pairing", "Ski Shores, Hula Hut, County Line on the lake", "The Oasis and marina culture on Travis"],
        [
          "Best use",
          "Boat day + waterfront meal without long drives",
          "Maximum open water when drive time is acceptable — see our [Lake Austin vs Lake Travis comparison](/lake-austin-vs-lake-travis-boat-rental)",
        ],
      ]
    ),
    b.h2("Is Ski Shores Good for Groups?"),
    b.p(
      "Yes — Ski Shores is casual, recognizable, and built for groups on the lake. The outdoor patio, dock-side atmosphere, and straightforward menu make it a natural fit for celebrations without dress-code stress."
    ),
    b.ul([
      "Birthday groups",
      "Bachelorette parties",
      "Bachelor parties",
      "Friend groups and reunions",
      "Family gatherings",
      "Corporate outings",
      "Out-of-town guests",
      "UT visitors and game-weekend groups",
      "Couples who want a relaxed waterfront meal",
    ]),
    b.img(
      "/photos/IMG_1197.webp",
      "Birthday group on a BoatBros ATX Lake Austin pontoon near Ski Shores",
      "Birthdays and group celebrations pair well with a Lake Austin rental plus a Ski Shores stop."
    ),
    b.h2("What to Bring for a Ski Shores and Lake Austin Boat Day"),
    b.ul([
      "Sunscreen (reef-safe if swimming)",
      "Sunglasses and a hat",
      "Towels",
      "Water and hydration",
      "Swimsuit under comfortable clothes",
      "Phone charger or portable battery",
      "Valid ID",
      "Light snacks for between stops",
      "Small dry bag for phone and wallet",
      "Comfortable lake-day clothes and non-marking shoes",
    ]),
    b.h2("Common Mistakes to Avoid"),
    b.ul([
      "Assuming dock space will always be open — confirm access directly with Ski Shores and build timing flexibility into your boat day.",
      "Waiting until the last minute to book your Lake Austin rental — summer Saturdays fill fast.",
      "Sending half the group ahead without coordinating timing — patio seating can get busy on weekends.",
      "Stacking too many restaurant stops — Ski Shores plus multiple marinas eats rental hours.",
      "Treating Ski Shores as the entire experience instead of pairing it with a proper boat day on the lake.",
    ]),
    b.faq([
      {
        q: "What is Ski Shores Austin?",
        a: "Ski Shores Café is a Lake Austin waterfront restaurant at 2905 Pearce Rd — open since 1954 and now part of McGuire Moorman Lambert Hospitality. It is known for patio dining, burgers, tacos, and a relaxed lake-day atmosphere.",
      },
      {
        q: "Where is Ski Shores located?",
        a: "2905 Pearce Rd, Austin, TX 78730 on Lake Austin. See [Ski Shores' official site](" + SKI_SHORES_URL + ") for current hours and contact info.",
      },
      {
        q: "Is Ski Shores on Lake Austin?",
        a: "Yes — Ski Shores Café is a waterfront restaurant on Lake Austin along Pearce Road, not Lake Travis.",
      },
      {
        q: "Can you get to Ski Shores by boat?",
        a: "Yes — Ski Shores is closely tied to boating culture on Lake Austin. Confirm current dock and access details directly with the restaurant. A captained [Lake Austin boat rental](/lake-austin-boat-rentals) is the easiest way to arrive and depart on your schedule.",
      },
      {
        q: "Does Ski Shores have boat docks?",
        a: "Ski Shores has long served boaters on Lake Austin. Dock space and availability can vary — call ahead on busy weekends and confirm current policies with the restaurant directly.",
      },
      {
        q: "Is Ski Shores good for groups?",
        a: "Yes — the relaxed patio, casual menu, and lake-side atmosphere work well for birthdays, friend groups, families, and bachelorette crews. Confirm group size and timing with the restaurant for larger parties.",
      },
      {
        q: "Is Ski Shores good for birthdays?",
        a: "Yes — casual, lake-accessible, and easy to combine with a captained Lake Austin boat rental for a full celebration day.",
      },
      {
        q: "Ski Shores vs Hula Hut — which is better for a boat day?",
        a: "Ski Shores offers a laid-back patio and burgers-and-tacos vibe on Pearce Road. Hula Hut delivers Tex-Mex, margaritas, and a livelier dock-party feel at Oyster Landing. Both work well — see our [Austin Hula Hut by boat](/blog/austin-hula-hut-lake-austin-guide) guide for the Hula Hut side.",
      },
      {
        q: "What should I do before or after Ski Shores on a boat day?",
        a: "Before: cruise and swim in a cove. After: continue along the shoreline or add another waterfront stop. The boat rental should frame the whole day.",
      },
      {
        q: "Lake Austin vs Lake Travis for a restaurant + boat day?",
        a: "Lake Austin (Ski Shores, Hula Hut, County Line) is closer to downtown with easier captained charter logistics. Lake Travis suits open-water priority if drive time works — see our [Lake Austin vs Lake Travis comparison](/lake-austin-vs-lake-travis-boat-rental).",
      },
      {
        q: "Who owns Ski Shores now?",
        a: "Ski Shores Café is operated by McGuire Moorman Lambert Hospitality — the Austin restaurant group behind local favorites like Elizabeth Street Café and Jeffrey's. The restaurant has been a Lake Austin staple since 1954.",
      },
      {
        q: "What is the best way to visit Ski Shores?",
        a: "Book a captained [Lake Austin boat rental](/lake-austin-boat-rentals), plan Ski Shores as one stop within a broader lake day, and confirm dock access directly with the restaurant before you go.",
      },
    ]),
    b.p(
      "Official sources: [Ski Shores Café](" +
        SKI_SHORES_URL +
        ") · [Austin American-Statesman patio guide](" +
        STATESMAN_PATIO_GUIDE +
        ")"
    ),
    b.cta(
      "Plan a Lake Austin Boat Day Around Ski Shores",
      "BoatBros ATX offers captained [Lake Austin boat rentals](/lake-austin-boat-rentals) built for swimming, cruising, and waterfront stops like Ski Shores. Browse experiences and build your itinerary around the lake — not just the dock."
    ),
  ],
};
