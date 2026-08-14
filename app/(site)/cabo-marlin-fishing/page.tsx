import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "Cabo marlin fishing guide — striped, blue, and black marlin context, release ethics, and why Full Day suits billfish-focused trips.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/cabo-marlin-fishing",
  title: "Cabo Marlin Fishing",
  description,
  ogImage: "/photos/nsf/sailfish-baitball.png",
  ogImageAlt: "Billfish near a baitball offshore",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/cabo-marlin-fishing"
      pageKey="cabo_marlin_fishing"
      h1="Cabo Marlin Fishing"
      lede="Cabo is famous for billfish opportunity — especially striped marlin — but every day depends on season, conditions, and the captain’s plan. Here’s how we talk about marlin without inventing guarantees."
      breadcrumbName="Cabo Marlin Fishing"
      metaDescription={description}
      heroImage="/photos/nsf/sailfish-baitball.png"
      heroAlt="Billfish near a baitball offshore"
      sections={[
        {
          type: "p",
          text: `Marlin fishing is one of the main reasons anglers book offshore time out of Cabo San Lucas. ${brand.companyName} treats billfish days as condition-driven private charters: Full Day for more range when you want a serious hunt, Half Day when a shorter private window fits your schedule.`,
        },
        {
          type: "h2",
          id: "striped",
          text: "Striped marlin",
        },
        {
          type: "p",
          text: "Striped marlin are Cabo’s signature billfish story for many visitors. They can show in numbers when bait and water line up — and they can be quiet when they don’t. Use the fishing calendar and best-time guide for planning questions; month ratings stay pending until first-party trip data fills them in.",
        },
        {
          type: "h2",
          id: "blue",
          text: "Blue marlin",
        },
        {
          type: "p",
          text: "Blue marlin are a larger, less everyday target than stripers for most Cabo charters. When blues are in play, crews often need time and range. We do not promise a blue on any given date — ask about recent patterns when you book and let the captain set expectations for your window.",
        },
        {
          type: "h2",
          id: "black",
          text: "Black marlin",
        },
        {
          type: "p",
          text: "Black marlin are rarer in typical visitor conversations than striped marlin. Treat them as an occasional possibility in the broader billfish mix, not a species every charter is built around. Honest trip reports (when published) are the right place for what actually showed up on real Nasty days.",
        },
        { type: "cta", experienceSlug: "nasty-full-day" },
        {
          type: "h2",
          id: "release",
          text: "Release ethics",
        },
        {
          type: "p",
          text: "Billfish are often catch-and-release. The crew will guide fight times, leader handling, and release technique so fish go back in good shape. Keep decisions for other species follow Mexican regulations and size limits — your captain will be clear on the day.",
        },
        {
          type: "h2",
          id: "full-day",
          text: "Why Full Day fits billfish focus",
        },
        {
          type: "p",
          text: "Full Day (8 hours) generally gives more room to run, search, and work a bite when marlin are the priority. Half Day (5 hours) still fishes private and offshore-capable, but a shorter clock can limit how far the day can stretch. Optional offshore-run upgrades may appear in checkout when available — they are not automatic and do not imply a named bank.",
        },
        {
          type: "h2",
          id: "planning",
          text: "Plan with calendar, season, and reports",
        },
        {
          type: "ul",
          items: [
            "Cabo fishing calendar — species × month grid (ratings pending verification)",
            "Best time to fish Cabo — decision paths by goal (marlin, tuna, dorado, variety)",
            "Fishing reports — real Nasty trip write-ups when published (hub may be empty at launch)",
          ],
        },
        {
          type: "note",
          text: "No catch guarantees. The captain sets the daily plan from live conditions — not from a marketing species checklist.",
        },
      ]}
      faqs={[
        {
          question: "Do you guarantee a marlin?",
          answer:
            "No. Billfish opportunity depends on season and conditions. We fish for a good shot; we do not guarantee hookups or species.",
        },
        {
          question: "Should I book Half Day or Full Day for marlin?",
          answer:
            "Full Day is usually the better fit when billfish are the focus because you have more time and range. Half Day can still be productive — ask when booking if you are unsure.",
        },
        {
          question: "Do you keep marlin?",
          answer:
            "Billfish are often catch-and-release. The crew will guide release practice; other species follow regulations and the captain’s advice.",
        },
        {
          question: "Where can I see recent fishing?",
          answer:
            "Check the fishing reports hub for published trip write-ups. If it is empty, reports have not been published yet — we only post real Cabo days.",
        },
      ]}
      related={[
        { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
        { href: "/best-time-to-fish-cabo", label: "Best time to fish Cabo" },
        { href: "/fishing-reports", label: "Fishing reports" },
        { href: "/experiences/nasty-full-day", label: "Full Day" },
        { href: "/experiences/nasty-half-day", label: "Half Day" },
        { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing Cabo" },
        { href: "/cabo-fishing-charter-prices", label: "Prices" },
        { href: "/cabo-roosterfish-fishing", label: "Roosterfish" },
      ]}
    />
  );
}
