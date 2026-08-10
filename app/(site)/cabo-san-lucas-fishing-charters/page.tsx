import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "Private Cabo San Lucas fishing charters with Nasty Sport Fishing — Half Day (5h) or Full Day (8h), captained, licenses arranged, book online.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/cabo-san-lucas-fishing-charters",
  title: "Cabo San Lucas Fishing Charters",
  description,
  ogImage: "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
  ogImageAlt: "View toward El Arco from a boat in Cabo San Lucas",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/cabo-san-lucas-fishing-charters"
      pageKey="cabo_san_lucas_fishing_charters"
      h1="Cabo San Lucas Fishing Charters"
      lede="Private, captained sportfishing from Marina Cabo San Lucas — book Nasty Half Day or Nasty Full Day on the live calendar."
      breadcrumbName="Cabo San Lucas Fishing Charters"
      metaDescription={description}
      heroImage="/photos/stock/cabo/el-arco-from-boat-pexels.jpg"
      heroAlt="View toward El Arco from a boat in Cabo San Lucas"
      showPricePreview
      sections={[
        {
          type: "p",
          text: "Nasty Sport Fishing runs private Cabo San Lucas fishing charters on a Cabo 40 Express sportfisher. You fish; a licensed captain and mate run the boat, set the plan from live conditions, and handle the day on the water.",
        },
        {
          type: "h2",
          id: "trips",
          text: "Half Day vs Full Day",
        },
        {
          type: "p",
          text: "Two charter lengths share the same private boat inventory:",
        },
        {
          type: "ul",
          items: [
            "Nasty Half Day — 5 hours. A focused Cabo day with morning or afternoon departures when available.",
            "Nasty Full Day — 8 hours. More range and time on the water when you want a longer offshore window.",
          ],
        },
        {
          type: "p",
          text: "Both are private charters (not shared seats). Capacity is typically up to six guests — confirm when you book.",
        },
        { type: "cta", experienceSlug: "nasty-half-day" },
        {
          type: "h2",
          id: "included",
          text: "What’s included",
        },
        {
          type: "p",
          text: "Standard charters include the private boat, captain and mate, premium tackle, live bait allowance, fishing licenses for up to four anglers, water, soft drinks, snacks, light breakfast, crew photos of the catch, and local-grounds fuel. Optional add-ons (resort transport, meals upgrades, offshore-run upgrade when offered, and more) are priced in checkout.",
        },
        {
          type: "h2",
          id: "species",
          text: "What you might target",
        },
        {
          type: "p",
          text: "Cabo’s mix changes with season and conditions. Days often revolve around striped marlin, yellowfin tuna, dorado (mahi), wahoo, and mixed-bag opportunities. The captain sets the plan for that morning — not a fixed “guaranteed species” list. For marlin-focused planning, see our marlin guide; for timing questions, start with the fishing calendar and best-time page.",
        },
        {
          type: "h2",
          id: "location",
          text: "Where we meet",
        },
        {
          type: "p",
          text: "We meet at Marina Cabo San Lucas. Exact slip, dock instructions, and check-in time are in your confirmation email after booking — arrive a bit early so the crew can load coolers and brief everyone before departure.",
        },
        {
          type: "h2",
          id: "boat",
          text: "The boat",
        },
        {
          type: "p",
          text: "Charters run on our Cabo 40 Express — a hard-top offshore sportfisher set up for Cabo bluewater work. See the boats page for photos and specs, then book Half Day or Full Day on the shared calendar.",
        },
        {
          type: "h2",
          id: "pricing",
          text: "Pricing snapshot",
        },
        {
          type: "p",
          text: "Founding Angler rates may be active at launch alongside standard rates; peak Full Day windows can price higher when configured. Tax is calculated at checkout. Full breakdown on the prices page.",
        },
        {
          type: "note",
          text: "Charters are captained only — guests do not run the boat. Licenses for guests are typically arranged as part of the charter.",
        },
      ]}
      faqs={[
        {
          question: "Are these private charters?",
          answer:
            "Yes. Nasty Half Day and Nasty Full Day are private boat charters with captain and mate — not shared open-boat seats.",
        },
        {
          question: "Can we run the boat ourselves?",
          answer:
            "No. Nasty Sport Fishing charters are captained only. You fish; we handle the boat, safety, and navigation.",
        },
        {
          question: "Do I need a Mexican fishing license?",
          answer:
            "Fishing licenses for guests are typically arranged as part of the charter. We’ll confirm what’s covered when you book.",
        },
        {
          question: "What is the cancellation policy?",
          answer:
            "Free cancellations until 30 days before the charter start time. 50% refund for cancellations between 15–30 days before start. Cancellations within 14 days of the start time are non-refundable. Weather cancellations by the captain are handled separately.",
        },
        {
          question: "What happens in bad weather?",
          answer:
            "Safety comes first. If wind, seas, or conditions are unsafe, the captain may delay, shorten, or cancel. When we cancel for weather, we reschedule or refund per the booking terms.",
        },
      ]}
      related={[
        { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
        { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
        { href: "/cabo-fishing-charter-prices", label: "Charter prices" },
        { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing Cabo" },
        { href: "/cabo-marlin-fishing", label: "Cabo marlin fishing" },
        { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
        { href: "/boats", label: "Boats" },
        { href: "/packages", label: "Multi-day packages" },
        { href: "/contact", label: "Contact" },
      ]}
    />
  );
}
