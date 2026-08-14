import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "What deep sea fishing means in Cabo — private offshore bluewater charters, Half Day vs Full Day, and optional offshore-run upgrades when available.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/deep-sea-fishing-cabo",
  title: "Deep Sea Fishing Cabo",
  description,
  ogImage: "/photos/nsf/sportfisher-running.png",
  ogImageAlt: "Sportfisher running offshore near Cabo San Lucas",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/deep-sea-fishing-cabo"
      pageKey="deep_sea_fishing_cabo"
      h1="Deep Sea Fishing in Cabo"
      lede="In Cabo, “deep sea” usually means private offshore bluewater fishing — not a lake trip. Here’s how Half Day and Full Day charters fit that style of day."
      breadcrumbName="Deep Sea Fishing Cabo"
      metaDescription={description}
      heroImage="/photos/nsf/sportfisher-running.png"
      heroAlt="Sportfisher running offshore near Cabo San Lucas"
      sections={[
        {
          type: "h2",
          id: "what-it-means",
          text: "What “deep sea” means here",
        },
        {
          type: "p",
          text: "Visitors searching for deep sea fishing in Cabo are usually looking for offshore sportfishing: bluewater runs for billfish, tuna, dorado, and other pelagics when conditions allow. It is not a fixed bank name or a promise of a specific mileage — the captain chooses the day’s plan from weather, bite reports, and how much time you have on the water.",
        },
        {
          type: "p",
          text: `${brand.companyName} charters are private and captained. Local-grounds fuel is included on standard trips; longer pushes may involve an optional offshore-run upgrade when that add-on is offered in checkout.`,
        },
        {
          type: "h2",
          id: "species",
          text: "Species you might encounter offshore",
        },
        {
          type: "ul",
          items: [
            "Striped marlin and other billfish when the season and conditions line up",
            "Yellowfin tuna",
            "Dorado (mahi)",
            "Wahoo",
            "Mixed pelagic opportunities depending on the day",
          ],
        },
        {
          type: "note",
          text: "We do not list invented fishing grounds or guarantee a species. Release ethics for billfish and keep rules for other fish follow Mexican regulations and the captain’s guidance on the day.",
        },
        { type: "cta", experienceSlug: "nasty-full-day" },
        {
          type: "h2",
          id: "half-vs-full",
          text: "Half Day vs Full Day for offshore days",
        },
        {
          type: "p",
          text: "Half Day (5 hours) is a solid private offshore window when you want time on the water without a full marathon. Full Day (8 hours) gives more range to work multiple areas when the bite is spread out — often the better fit if billfish or a longer bluewater hunt is the priority.",
        },
        {
          type: "h2",
          id: "offshore-run",
          text: "Offshore-run upgrade",
        },
        {
          type: "p",
          text: "Longer runs depend on conditions, fuel planning, and captain judgment — they are not automatic on every booking and are not a claim about a specific bank or mileage. If you want extra range, ask when booking so we can plan the day.",
        },
        {
          type: "h2",
          id: "book",
          text: "How to book",
        },
        {
          type: "p",
          text: "Check live availability for Half Day or Full Day, or browse pricing and the fishing calendar first if you are still deciding timing. Multi-day packages are inquiry-only and separate from day-charter inventory.",
        },
      ]}
      faqs={[
        {
          question: "Is deep sea fishing the same as a shared party boat?",
          answer:
            "No. Our charters are private: your group on the Cabo 40 Express with captain and mate. We do not sell shared open-boat seats.",
        },
        {
          question: "How far offshore do we go?",
          answer:
            "It depends on the bite and conditions. Full-day trips generally give more range. We do not promise a fixed run distance.",
        },
        {
          question: "Is fuel included?",
          answer:
            "Local-grounds fuel is included on standard charters. Optional offshore-run upgrades, when available, are priced separately in checkout.",
        },
        {
          question: "What if weather is unsafe?",
          answer:
            "If wind, seas, or conditions are unsafe, the captain may delay, shorten, or cancel. Weather cancellations are rescheduled or refunded per booking terms.",
        },
      ]}
      related={[
        { href: "/experiences/nasty-half-day", label: "Half Day" },
        { href: "/experiences/nasty-full-day", label: "Full Day" },
        { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas charters" },
        { href: "/cabo-fishing-charter-prices", label: "Prices" },
        { href: "/cabo-marlin-fishing", label: "Marlin fishing" },
        { href: "/best-time-to-fish-cabo", label: "Best time to fish Cabo" },
        { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
        { href: "/boats/cabo-40-express", label: "Boats" },
      ]}
    />
  );
}
