import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "Cabo roosterfish fishing — inshore-oriented opportunity that depends on conditions. Ask when booking; not every charter targets roosterfish.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/cabo-roosterfish-fishing",
  title: "Cabo Roosterfish Fishing",
  description,
  ogImage: "/photos/nsf/yellowfin-marina-duo.png",
  ogImageAlt: "Anglers with a catch at the marina in Cabo",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/cabo-roosterfish-fishing"
      pageKey="cabo_roosterfish_fishing"
      h1="Cabo Roosterfish Fishing"
      lede="Roosterfish are an inshore-oriented Cabo target — exciting when conditions line up, and not something every offshore charter is built around. Ask when you book."
      breadcrumbName="Cabo Roosterfish Fishing"
      metaDescription={description}
      heroImage="/photos/nsf/yellowfin-marina-duo.png"
      heroAlt="Anglers with a catch at the marina in Cabo"
      sections={[
        {
          type: "h2",
          id: "inshore",
          text: "Inshore nature of roosterfish days",
        },
        {
          type: "p",
          text: `Roosterfish fishing is a different plan than a classic offshore marlin or tuna hunt. It tends to stay closer to shorelines and structure when the fish are around — and it still depends on water, bait, and weather. ${brand.companyName}’s standard products are private Half Day and Full Day charters with a captain who sets the day’s program from live conditions.`,
        },
        {
          type: "note",
          text: "We do not guarantee roosterfish, and we do not claim that every charter targets them. If roosters are a priority for your group, say so when booking so the crew can set honest expectations for your date.",
        },
        {
          type: "h2",
          id: "conditions",
          text: "Conditions-dependent — ask when booking",
        },
        {
          type: "p",
          text: "Some days favor bluewater; some days allow a more coastal program; some days mix both within your time window. Half Day (5 hours) and Full Day (8 hours) change how much of that menu you can try. Roosterfish interest is worth mentioning early — along with whether you prefer a billfish-first offshore day instead.",
        },
        { type: "cta" },
        {
          type: "h2",
          id: "vs-offshore",
          text: "How this differs from offshore billfish days",
        },
        {
          type: "ul",
          items: [
            "Marlin-focused days usually emphasize offshore bluewater time — see the marlin guide.",
            "Roosterfish interest is more coastal / inshore-oriented when it makes sense.",
            "Neither style is a guaranteed species outcome — only a planning preference for the captain.",
          ],
        },
        {
          type: "h2",
          id: "season",
          text: "Season notes",
        },
        {
          type: "p",
          text: "Month-by-month roosterfish ratings on the fishing calendar start as pending until verified from Nasty trip reports. Use the best-time page for decision-style planning while that grid fills in. When reports publish, they will reflect real days — not invented highlight reels.",
        },
        {
          type: "h2",
          id: "book",
          text: "Book a private charter",
        },
        {
          type: "p",
          text: "Check availability for Half Day or Full Day, review prices, or contact us if your group has a specific roosterfish request tied to dates. Captained only; licenses are typically arranged as part of the charter.",
        },
      ]}
      faqs={[
        {
          question: "Will my charter definitely target roosterfish?",
          answer:
            "Not necessarily. Tell us if roosters are a priority when you book. The captain still sets the plan from conditions — and some dates are better suited to offshore bluewater species.",
        },
        {
          question: "Do you guarantee a roosterfish?",
          answer:
            "No. Roosterfish are conditions-dependent. We will be honest about the outlook for your dates.",
        },
        {
          question: "Is roosterfishing the same as deep sea fishing?",
          answer:
            "Usually no. Deep sea / offshore days emphasize bluewater pelagics. Roosterfish interest is more inshore-oriented when it is on the menu.",
        },
        {
          question: "What is the cancellation policy?",
          answer:
            "Free cancellations until 30 days before start; 50% refund between 15–30 days; non-refundable within 14 days. Weather cancellations by the captain are handled separately.",
        },
      ]}
      related={[
        { href: "/cabo-marlin-fishing", label: "Cabo marlin fishing" },
        { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
        { href: "/best-time-to-fish-cabo", label: "Best time to fish Cabo" },
        { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing Cabo" },
        { href: "/experiences/nasty-half-day", label: "Half Day" },
        { href: "/experiences/nasty-full-day", label: "Full Day" },
        { href: "/fishing-reports", label: "Fishing reports" },
        { href: "/contact", label: "Contact" },
      ]}
    />
  );
}
