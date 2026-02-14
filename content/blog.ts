/**
 * The Dock – boat tips, Austin events, lake & boating news.
 * Posts can be moved to CMS/MDX later.
 */

export type BlogCategory = "boat-tips" | "austin-events" | "lake-news" | "general";

export type BlogBodyBlock = { type: "p"; content: string } | { type: "h2"; content: string } | { type: "h3"; content: string } | { type: "ul"; items: string[] };

export interface BlogPostFaq {
  q: string;
  a: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateModified?: string;
  author?: string;
  image?: string;
  imageAlt?: string;
  category: BlogCategory;
  /** For SEO and rich snippets */
  readingTimeMinutes?: number;
  body: BlogBodyBlock[];
  /** SEO: focus keyphrase for this post */
  seoKeywords?: string[];
  /** Optional: key takeaways for top of article (UX + SEO) */
  keyTakeaways?: string[];
  /** Optional: FAQ pairs for FAQ schema (Google rich results) */
  faqs?: BlogPostFaq[];
  /** Optional: internal + external links for SEO and UX (Google values both) */
  relatedLinks?: { href: string; text: string; external?: boolean }[];
}

const categoryLabels: Record<BlogCategory, string> = {
  "boat-tips": "Boat Tips",
  "austin-events": "Austin Events",
  "lake-news": "Lake & Boating News",
  general: "Stories",
};

export function getCategoryLabel(cat: BlogCategory): string {
  return categoryLabels[cat];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "lake-austin-bachelorette-boat-rental-guide",
    title: "Lake Austin Bachelorette Boat Rental: Pontoon Party Ideas, Tips & What to Book",
    excerpt:
      "Plan the ultimate bachelorette on Lake Austin—boat day, pontoon party ideas, what to bring, and where to eat after (including Ski Shores and downtown Austin). Book a captained pontoon and lock in dinner.",
    date: "2025-02-08",
    dateModified: "2025-02-10",
    author: "Boat Bros",
    image: "/photos/IMG_1197.webp",
    imageAlt: "Group on a pontoon on Lake Austin for a bachelorette or party",
    category: "boat-tips",
    readingTimeMinutes: 14,
    seoKeywords: [
      "Lake Austin boat rental for bachelorette",
      "Lake Austin party boat rental",
      "Lake Austin pontoon party",
      "bachelorette boat party Lake Austin",
      "Lake Austin pontoon rental bachelorette",
    ],
    keyTakeaways: [
      "A Lake Austin boat rental for a bachelorette is ideal: scenic, group-friendly, and easy to make special with a captained pontoon.",
      "Book a pontoon with a captain so everyone can relax—no one has to drive. Plan 3–4 hours minimum; half-day or full-day gives time for coves, photos, and snacks.",
      "Bring sunscreen, water, soft-sided cooler (no glass), decorations that won't fly away, and waterproof bags for phones.",
      "After the boat: Ski Shores Cafe and other waterfront spots near Lake Austin are popular; downtown (Rainey Street, South Congress) works too—reserve ahead.",
      "Book the boat well ahead for weekends and summer; add a banner or balloons if your operator allows.",
    ],
    faqs: [
      { q: "Is a Lake Austin boat rental good for a bachelorette party?", a: "Yes. A Lake Austin boat rental for a bachelorette is one of the most popular choices—scenic water, room for the whole group on a pontoon, and a captained rental means everyone can relax and celebrate. Pontoon rentals on Lake Austin are built for groups and often used for bachelorette and birthday parties." },
      { q: "Do I need a captain for a bachelorette boat party on Lake Austin?", a: "A captained Lake Austin boat rental is strongly recommended. No one has to drive or dock; everyone can swim, take photos, and enjoy the day. Boat Bros and many other operators offer captained pontoon rentals on Lake Austin." },
      { q: "Where should we eat after a Lake Austin bachelorette boat day?", a: "Ski Shores Cafe on Lake Austin is a classic waterfront spot with dock access and patio dining—great for groups. Lots of crews also head downtown to Rainey Street, South Congress, or the Domain. Reserve ahead for big groups." },
      { q: "How long should we book a Lake Austin pontoon for a bachelorette?", a: "Plan at least 3–4 hours; many groups do a half-day (4–5 hours) or full-day so you have time for coves, swimming, photos, and snacks. Sunset cruises work if you want a shorter trip or an evening vibe before dinner." },
      { q: "What should we bring for a bachelorette boat party on Lake Austin?", a: "Sunscreen, water, a soft-sided cooler with drinks and snacks (no glass), towels, waterproof phone cases or bags, and dry clothes for the ride back. Decorations like banners or balloons are fine if they're secure. Life jackets are provided." },
    ],
    body: [
      { type: "p", content: "So you're planning a Lake Austin bachelorette—good call. A [boat day on the lake](/experiences) is one of those things that actually lives up to the hype: you get the crew on a pontoon, someone else drives, and you just swim, snack, and take way too many photos. I've put together what actually works: what to book, what to bring, pontoon party ideas that don't flop, and—because the day doesn't end when you dock—where to eat and what to do after the boat so the whole trip feels like one solid celebration." },
      { type: "h2", content: "Why a Lake Austin Boat Rental for a Bachelorette?" },
      { type: "p", content: "Lake Austin is one of the best lakes in Texas for a group day. The water's constant-level (no weird low-water surprises), there are coves everywhere for swimming and anchoring, and the hills in the background make the photos actually good. A [Lake Austin party boat rental](/experiences/lake-austin-pontoon) is usually a pontoon—enough room for everyone to move around, hang out, and not feel cramped. Book it with a captain and nobody has to worry about driving or docking; the bride can actually relax and the rest of you can focus on making it fun." },
      { type: "h2", content: "What to Book: Pontoon, Captain & How Long" },
      { type: "p", content: "For a bachelorette, book a [Lake Austin pontoon rental](/experiences/lake-austin-pontoon) that fits your group (most hold 10–15; double-check capacity when you book). Go captained—trust me, you want everyone in on the fun, not one person stuck at the wheel. Plan for at least 3–4 hours; a lot of groups do a half-day or full-day so you have time to hit a cove, swim, snack, and get all the pics. If you'd rather do a shorter trip and then dinner, a [Lake Austin sunset cruise](/experiences/sunset) is a solid move: you're on the water for golden hour, then you head straight to dinner." },
      { type: "h3", content: "Capacity, Decorations & What to Ask When You Book" },
      { type: "p", content: "Pontoon rentals on Lake Austin are built for groups. When you [book](/booking), confirm capacity (including the captain) and whether they're cool with decorations—banners, balloons, etc. Just nothing that could blow into the water or block the captain's view. Some Lake Austin boat rental companies have add-ons (coolers, ice, Bluetooth); ask when you book so you're not scrambling the morning of." },
      { type: "h2", content: "What to Bring for Your Bachelorette Boat Day" },
      { type: "p", content: "Sunscreen (reef-safe if you're swimming), water, and a soft-sided cooler with ice, drinks, and snacks. No glass—most Lake Austin boat rentals don't allow it. Towels, dry clothes for the ride back, and waterproof bags or cases for phones and keys. If you're bringing games or props, keep them boat-friendly and pack out whatever you pack in. Life jackets are provided; if anyone's under 12, you can bring your own USCG-approved vests." },
      { type: "h2", content: "Pontoon Party Ideas That Actually Work" },
      { type: "ul", items: ["Pick a cove and anchor for swimming and floating—your captain will know good spots.", "Bluetooth speaker for a playlist (a lot of boats have one); keep the volume respectful.", "Plan a couple of photo moments: bridge backdrop, sunset, or a \"bride to be\" banner.", "Simple games (water-safe cards, float races) work; skip anything that could scratch the boat or leave trash.", "Coordinate outfits or colors for photos—quick-dry or swim-friendly so everyone's comfortable."] },
      { type: "h2", content: "After the Boat: Dinner & What to Do Near the Lake" },
      { type: "p", content: "The boat day is the main event, but the vibe doesn't have to stop at the dock. A lot of bachelorette groups do dinner right after—either near the lake or downtown—so you can roll from boat to table without losing the group energy." },
      { type: "h3", content: "Dinner Near Lake Austin & the Waterfront" },
      { type: "p", content: "If you want to stay close to the water, [Ski Shores Cafe](https://www.skishorescafe.com/) is a Lake Austin institution—waterfront dining since 1954, with dock access for boaters and a relaxed patio that's perfect for groups. It's a go-to for bachelorette crews who want to roll straight from the boat to dinner without leaving the lake vibe. Plenty of other spots along the Lake Austin area offer waterfront views too. Reservations for big groups fill up on weekends, so book a table when you [lock in your boat rental](/booking) so you're not stuck figuring it out after a full day in the sun." },
      { type: "h3", content: "Downtown Austin: Rainey Street, South Congress & More" },
      { type: "p", content: "If you'd rather switch it up and go downtown, Rainey Street is a go-to for bachelorette groups—bars and restaurants in converted houses, very walkable, and easy to do dinner then drinks. South Congress has a more laid-back Austin vibe with lots of restaurants and shops. The Domain is another option if you want a more polished dinner-and-cocktails scene. Whichever you pick, reserve ahead; bachelorette-sized tables go fast on Friday and Saturday nights." },
      { type: "h3", content: "Other Ideas: Brunch the Next Day, Pool Day, or a Late Night" },
      { type: "p", content: "If you're in town for more than a day, lots of groups do brunch the morning after the boat—everyone's already together and it's an easy wind-down. Or pair the boat with a pool day (morning boat, afternoon by the pool at your rental or a hotel). If your crew has the energy, a late dinner and a few stops on Rainey or Sixth can cap the night; just pace it so the bride (and you) actually enjoy it." },
      { type: "h2", content: "Booking Your Lake Austin Bachelorette Boat Rental" },
      { type: "p", content: "[Book your Lake Austin boat rental](/booking) for the bachelorette as early as you can—weekends and summer dates fill up. When you book, confirm group size, how long you want, and whether you're doing morning, afternoon, or sunset. At [Boat Bros](/experiences) we run captained Lake Austin pontoon rentals that work really well for bachelorette parties—you bring the crew and the vibes, we handle the boat and the route. Once that's set, lock in dinner (and maybe brunch) so the whole day flows. Ready to plan? [Book your Lake Austin pontoon party](/booking) and we'll see you on the water." },
    ],
    relatedLinks: [
      { href: "/experiences", text: "Lake Austin boat rentals – pontoon, wake, sunset", external: false },
      { href: "/experiences/lake-austin-pontoon", text: "Lake Austin pontoon rental", external: false },
      { href: "/experiences/sunset", text: "Lake Austin sunset cruise", external: false },
      { href: "/booking", text: "Book a boat rental", external: false },
      { href: "/blog", text: "The Dock – more boat tips & lake news", external: false },
      { href: "https://www.skishorescafe.com/", text: "Ski Shores Cafe – waterfront dining on Lake Austin", external: true },
      { href: "https://www.austintexas.org/", text: "Visit Austin – things to do in Austin, TX", external: true },
    ],
  },
  {
    slug: "what-to-bring-lake-austin-boat-rental",
    title: "What to Bring on a Lake Austin Boat Rental: The Ultimate Checklist",
    excerpt:
      "Don’t show up empty-handed. From sunscreen to coolers, here’s exactly what to bring for your Lake Austin boat rental so your day on the water is safe, fun, and stress-free.",
    date: "2025-01-15",
    dateModified: "2025-02-01",
    author: "Boat Bros",
    image: "/photos/IMG_9649.webp",
    imageAlt: "Group on a pontoon on Lake Austin with coolers and gear",
    category: "boat-tips",
    readingTimeMinutes: 8,
    seoKeywords: [
      "Lake Austin boat rental",
      "what to bring boat rental",
      "Lake Austin pontoon rental checklist",
      "boat day essentials Lake Austin",
      "Lake Austin pontoon rental what to bring",
    ],
    keyTakeaways: [
      "Sunscreen, water, and reef-safe products are non-negotiable for any Lake Austin boat rental.",
      "Pontoon rentals: soft-sided cooler (no glass), towels, waterproof phone case, and dry clothes for the ride back.",
      "Wake boat rentals: rash guard, water shoes, and a towel you don't mind getting wet.",
      "Life jackets are provided; bring USCG-approved vests for kids or custom fit if you prefer.",
      "Never bring glass, hard coolers, or drones without permission—pack out everything you pack in.",
    ],
    faqs: [
      { q: "What should I bring on a Lake Austin pontoon rental?", a: "Bring sunscreen (reef-safe), water, a soft-sided cooler with ice and drinks (no glass), towels, waterproof phone case, dry clothes for the ride back, and snacks. Life jackets are provided by your operator." },
      { q: "Can I bring glass on a Lake Austin boat rental?", a: "Most Lake Austin boat rental operators, including Boat Bros, do not allow glass bottles or containers. Use cans, plastic, or reusable bottles to keep everyone safe and the boat in good condition." },
      { q: "Do I need to bring life jackets for a Lake Austin boat rental?", a: "No. USCG-approved life jackets are provided by your Lake Austin boat rental operator. You may bring your own if you have kids or prefer a specific fit." },
      { q: "What should I not bring on a boat rental?", a: "Avoid glass bottles, hard coolers that can scratch the boat, drones (unless you have permission), and anything that can't get wet. Assume everything may get splashed." },
    ],
    body: [
      { type: "p", content: "Booking a Lake Austin boat rental is the easy part. The real win is showing up prepared—so you spend the day swimming, cruising, and relaxing instead of worrying you forgot something. Whether you’re on a pontoon, wake boat, or sunset cruise, this checklist covers everything you need for a perfect day on the water." },
      { type: "h2", content: "Essentials for Every Lake Austin Boat Rental" },
      { type: "p", content: "Sunscreen (reef-safe if you’re swimming), sunglasses, a hat, and a reusable water bottle are non-negotiable. Lake Austin sun is intense even on cloudy days. Bring more water than you think you need—hydration keeps the crew happy and safe." },
      { type: "h3", content: "What to Bring for a Pontoon or Party Boat" },
      { type: "p", content: "Pontoon rentals on Lake Austin are built for groups. Pack a soft-sided cooler (no glass—many operators don’t allow it), ice, drinks, and snacks. Bluetooth speakers are usually on board, but bring a waterproof phone case and a portable charger. Towels, dry clothes for the ride back, and waterproof bags for phones and keys will make the day smoother." },
      { type: "h3", content: "What to Bring for Wake Surf or Watersports" },
      { type: "p", content: "For wake boat or wake surf rentals on Lake Austin, bring a change of clothes and a towel you don’t mind getting wet. Water shoes or sandals that stay on are handy for getting in and out of the boat. If you’re new to wakeboarding or wakesurfing, wear a rash guard or wetsuit top if you have one—you’ll spend a lot of time in the water." },
      { type: "h2", content: "Safety & Comfort on Lake Austin" },
      { type: "p", content: "Life jackets are provided by your Lake Austin boat rental operator, but if you have kids or prefer a specific fit, you can bring your own USCG-approved vests. Motion-sickness medication is a good idea if anyone in your group is prone to it. A small first-aid kit with bandages and antiseptic doesn’t take much space and can save the day." },
      { type: "h2", content: "What Not to Bring on Your Boat Rental" },
      { type: "ul", items: ["Glass bottles or containers (use cans, plastic, or reusable)", "Hard coolers that scratch the boat", "Drones (unless you have permission and know the rules)", "Anything that can’t get wet—assume everything might get splashed"] },
      { type: "p", content: "When you book with Boat Bros, we’ll send you a reminder with the essentials and any trip-specific tips. Show up with this list covered and you’re set for an unforgettable Lake Austin boat day." },
    ],
  },
  {
    slug: "best-coves-spots-lake-austin-pontoon-swimming",
    title: "Best Coves & Spots on Lake Austin for Pontoon Parties and Swimming",
    excerpt:
      "Where to anchor, swim, and hang out on Lake Austin. Our favorite coves and spots for pontoon parties, swimming, and a perfect day on the water—from 360 to the dam.",
    date: "2025-01-20",
    dateModified: "2025-02-01",
    author: "Boat Bros",
    image: "/photos/IMG_5116%202.webp",
    imageAlt: "Pontoon boat anchored in a calm cove on Lake Austin",
    category: "lake-news",
    readingTimeMinutes: 9,
    seoKeywords: [
      "Lake Austin coves",
      "best spots Lake Austin boat",
      "Lake Austin pontoon swimming",
      "where to anchor Lake Austin",
      "Lake Austin best coves pontoon",
    ],
    keyTakeaways: [
      "Lake Austin is a constant-level reservoir (~20 miles), ideal for pontoon rentals and predictable water levels.",
      "Loop 360 (Pennybacker Bridge) area: easy access, great views, busy on weekends—go early or late.",
      "Mid-lake coves are quieter and perfect for swimming and floating.",
      "Near Tom Miller Dam: narrower lake, dramatic scenery, great for sunset cruises.",
      "Always anchor in safe areas, respect no-wake zones and private docks, and pack out everything you bring.",
    ],
    faqs: [
      { q: "Where are the best coves on Lake Austin for pontoon swimming?", a: "Popular areas include coves near Loop 360 (Pennybacker Bridge), mid-lake coves up-lake from 360, and areas closer to Tom Miller Dam. Your captained Lake Austin boat rental can recommend the best spot for the day based on traffic and conditions." },
      { q: "Is Lake Austin good for pontoon parties?", a: "Yes. Lake Austin is a constant-level reservoir with clear water, scenic hills, and many coves suitable for anchoring and swimming. It's one of the most popular lakes in Texas for pontoon rentals and group outings." },
      { q: "Can I anchor anywhere on Lake Austin?", a: "No. Anchor only in safe, open areas. Avoid private docks, marked no-wake zones, and restricted areas. Your captain will know the best and safest spots for your Lake Austin boat rental." },
      { q: "What is the best time to go to Lake Austin coves?", a: "Weekends get busy near 360; going early or later in the day often means calmer water and fewer boats. Mid-week and mid-lake coves tend to be quieter year-round." },
    ],
    body: [
      { type: "p", content: "Lake Austin is one of the best lakes in Texas for a pontoon day—clear water, scenic hills, and plenty of coves to drop anchor and swim. Whether you’re on a Lake Austin boat rental for a bachelorette party, family day, or just friends and coolers, knowing where to go makes the day even better. Here are our favorite spots for pontoon parties and swimming on Lake Austin." },
      { type: "h2", content: "Why Lake Austin for Pontoon Rentals?" },
      { type: "p", content: "Lake Austin is a constant-level reservoir fed by the Colorado River and managed by the Lower Colorado River Authority (LCRA). Water levels stay stable year-round, so the shoreline is predictable and coves don't dry up. The lake runs roughly 20 miles from Tom Miller Dam near downtown Austin up toward the Hill Country, with a mix of quiet coves and open water. Pontoon rentals can comfortably explore the main body and tuck into coves for swimming, lunch, and floating." },
      { type: "h2", content: "Best Coves & Areas for Swimming and Anchoring" },
      { type: "h3", content: "Near Loop 360 (Pennybacker Bridge)" },
      { type: "p", content: "The 360 area is popular for a reason—easy access from Austin, iconic views of the Pennybacker Bridge, and several coves that offer shade and calmer water. It can get busy on weekends, so early morning or late afternoon is ideal for a first-time Lake Austin pontoon rental. Great for photos and a central base if you want to stay near the bridge." },
      { type: "h3", content: "Mid-Lake Coves" },
      { type: "p", content: "As you head up-lake from 360, you’ll find quieter coves with less traffic. These spots are ideal for swimming, floating, and hanging out without the buzz of the main channel. Your captain can point out local favorites based on water conditions and crowd levels." },
      { type: "h3", content: "Toward the Dam" },
      { type: "p", content: "Closer to Tom Miller Dam, the lake narrows and the scenery gets more dramatic. There are smaller coves and generally calmer water for swimming. This stretch is great for sunset cruises and a more relaxed vibe, with less through-boat traffic." },
      { type: "h2", content: "Tips for a Great Day on the Water" },
      { type: "ul", items: ["Anchor only in safe, open areas—avoid private docks, no-wake zones, and marked restricted areas.", "Bring a float or two for swimming; Lake Austin water is clean and inviting.", "Respect other boats and shoreline residents; keep music at a reasonable level.", "Pack out what you pack in; leave no trash to keep Lake Austin clean.", "Sunscreen and water: even in coves, Texas sun is strong—stay hydrated and protected."] },
      { type: "h2", content: "Booking a Lake Austin Boat Rental for Coves & Swimming" },
      { type: "p", content: "When you book a Lake Austin boat rental with Boat Bros, our captains know these waters. We'll help you choose the best spots for your group size, vibe, and the day's conditions. Ready to find your favorite cove? Book your pontoon, wake boat, or sunset cruise and we'll see you on the water." },
    ],
  },
  {
    slug: "lake-austin-sunset-cruise-guide",
    title: "Lake Austin Sunset Cruise: Best Time, Spots & What to Expect",
    excerpt:
      "Plan the perfect Lake Austin sunset cruise. Best times to go, where to cruise, what to bring, and why a captained sunset boat rental on Lake Austin is worth it.",
    date: "2025-02-05",
    dateModified: "2025-02-10",
    author: "Boat Bros",
    image: "/photos/IMG_9647%202.webp",
    imageAlt: "Sunset over Lake Austin from a boat",
    category: "lake-news",
    readingTimeMinutes: 10,
    seoKeywords: [
      "Lake Austin sunset cruise",
      "Sunset boat rental Lake Austin",
      "Lake Austin sunset boat",
      "best time sunset cruise Lake Austin",
      "captained sunset cruise Lake Austin",
    ],
    keyTakeaways: [
      "The best time for a Lake Austin sunset cruise is roughly 1–1.5 hours before official sunset; golden hour and twilight are ideal for photos and views.",
      "Lake Austin's constant-level water and Hill Country backdrop make it one of the best sunset cruise spots in Texas.",
      "A captained Lake Austin boat rental means you enjoy the views and your group—no driving, docking, or navigation stress.",
      "Pack light: sunscreen, layers for after sunset, and a camera. Most sunset cruises are 2–3 hours.",
      "Book ahead in spring and summer; sunset slots fill fast for holidays and weekends.",
    ],
    faqs: [
      { q: "What is the best time for a Lake Austin sunset cruise?", a: "Start about 1 to 1.5 hours before official sunset so you're on the water for golden hour and twilight. Sunset times vary by season—roughly 6:00–6:30 PM in spring/fall and 8:00–8:30 PM in summer. Your Lake Austin sunset cruise operator can confirm the best departure time when you book." },
      { q: "Do I need a captain for a Lake Austin sunset boat rental?", a: "You can rent with or without a captain. A captained Lake Austin boat rental is popular for sunset cruises so everyone can relax, take photos, and enjoy the views. The captain knows the best routes and safe spots for the evening light." },
      { q: "How long is a typical Lake Austin sunset cruise?", a: "Most Lake Austin sunset cruises run 2–3 hours, covering golden hour and dusk. That's enough time to cruise toward the dam or along scenic stretches and anchor for a few minutes to watch the sun go down." },
      { q: "What should I bring on a Lake Austin sunset cruise?", a: "Sunscreen (you're still in the sun until sunset), a light layer for after dark, sunglasses, and a camera or phone. Soft-sided cooler with drinks and snacks if your operator allows it. Life jackets are provided. Avoid glass containers." },
    ],
    body: [
      { type: "p", content: "A Lake Austin sunset cruise is one of the best ways to cap a day in Austin—golden light over the water, the Hill Country in the background, and no driving or docking stress when you book a captained boat. Whether you're celebrating something special or just want a relaxed evening on the water, here's what you need to know: best time to go, where to cruise, and what to expect from a sunset boat rental on Lake Austin." },
      { type: "h2", content: "Why Lake Austin for a Sunset Cruise?" },
      { type: "p", content: "Lake Austin is a constant-level reservoir, so water levels stay predictable and the shoreline stays scenic year-round. The lake runs from Tom Miller Dam near downtown Austin up into the Hill Country, giving you a mix of open water and tree-lined coves. Because it's managed by the LCRA, you get consistent conditions—unlike some Texas lakes that fluctuate with drought. For a sunset boat rental, that means reliable routes and photo-ready backdrops every time." },
      { type: "h2", content: "Best Time for a Lake Austin Sunset Cruise" },
      { type: "p", content: "Timing is everything. Plan to be on the water about 1 to 1.5 hours before official sunset so you catch golden hour and the actual drop. Sunset times shift with the season: in spring and fall you're often looking at 6:00–6:30 PM; in summer, 8:00–8:30 PM. Your Lake Austin sunset cruise operator will suggest a departure time when you book—typically 1.5–2 hours before sunset for a 2–3 hour cruise that includes twilight." },
      { type: "h3", content: "Golden Hour and Twilight" },
      { type: "p", content: "The hour before sunset (golden hour) gives you the best light for photos and the most dramatic colors. After the sun sets, twilight lasts another 20–30 minutes—great for silhouettes and a calm ride back. A captained Lake Austin boat rental lets you focus on the view instead of watching the clock or navigating in low light." },
      { type: "h2", content: "Where to Cruise for Sunset on Lake Austin" },
      { type: "p", content: "Popular options include cruising toward Tom Miller Dam (narrower lake, dramatic hills) or staying near the Loop 360 / Pennybacker Bridge area for the iconic Austin skyline and bridge in the frame. Mid-lake stretches offer open water and fewer boats. Your captain will know the best route for the evening's light and traffic." },
      { type: "h2", content: "What to Expect on a Lake Austin Sunset Boat Rental" },
      { type: "p", content: "Most Lake Austin sunset cruises last 2–3 hours. You'll typically board 15–30 minutes before the planned cruise start, get a quick safety briefing, then head out. The boat is usually a pontoon or similar—comfortable for groups, with space to move around and take photos. Life jackets are provided. If you've booked a captained Lake Austin boat rental, the captain handles all driving and docking; you just enjoy the ride and the views." },
      { type: "h2", content: "What to Bring (and What Not To)" },
      { type: "ul", items: ["Sunscreen—you're in the sun until sunset.", "A light jacket or layer—it can get breezy after dark.", "Sunglasses and a hat.", "Camera or phone (waterproof case if you're cautious).", "Drinks and snacks in a soft-sided cooler if allowed (no glass)."] },
      { type: "p", content: "Leave glass bottles, hard coolers, and anything that can't get wet at home. Pack out what you pack in to keep Lake Austin clean." },
      { type: "h2", content: "Booking a Lake Austin Sunset Cruise" },
      { type: "p", content: "Sunset slots fill fast in spring and summer, especially for weekends and holidays. Book your Lake Austin sunset cruise in advance. At Boat Bros, we offer captained sunset boat rentals on Lake Austin—you show up, we handle the rest. Ready for golden hour? Book your sunset cruise and we'll see you on the water." },
    ],
  },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getBlogPostsByCategory(category: BlogCategory): BlogPost[] {
  return blogPosts.filter((p) => p.category === category);
}
