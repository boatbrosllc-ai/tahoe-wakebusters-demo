import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "How to choose fishing charters in Cabo San Lucas — boat, crew, inclusions, licenses, cancel policy — then how Nasty Sport Fishing is structured with verified catalog facts.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/best-fishing-charters-cabo-san-lucas",
  title: "Best Fishing Charters Cabo San Lucas",
  description,
  ogImage: "/photos/nsf/sportfisher-running.png",
  ogImageAlt: "Cabo sportfisher running on the water",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/best-fishing-charters-cabo-san-lucas"
      pageKey="best_fishing_charters_cabo_san_lucas"
      h1="Best Fishing Charters in Cabo San Lucas"
      lede="A practical buyer’s guide for Cabo San Lucas — how to compare private charters honestly, then how Nasty Sport Fishing is set up using only what we can verify from our catalog."
      breadcrumbName="Buyer’s Guide"
      metaDescription={description}
      heroImage="/photos/nsf/sportfisher-running.png"
      heroAlt="Cabo sportfisher running on the water"
      sections={[
        {
          type: "p",
          text: "“Best” should mean best fit for your group — not a fake #1 ranking. Use the checklist below when you compare any Cabo San Lucas operator, then read how Nasty structures Half Day, Full Day, inclusions, and booking.",
        },
        {
          type: "h2",
          id: "checklist",
          text: "How to choose a Cabo fishing charter",
        },
        {
          type: "h3",
          text: "Boat and private vs shared",
        },
        {
          type: "p",
          text: "Ask whether you are booking the whole boat or a shared seat. Confirm capacity, photos of the actual vessel, and whether the boat matches the listing. Private charters cost more per trip but give your group the cockpit and the schedule.",
        },
        {
          type: "h3",
          text: "Crew, tackle, bait, and fuel",
        },
        {
          type: "p",
          text: "Clarify captain and mate inclusion, tackle quality, bait allowance, and whether fuel is local-grounds only or if long runs cost extra. Opaque “plus fuel” quotes are a common surprise.",
        },
        {
          type: "h3",
          text: "Licenses, duration, and inclusions",
        },
        {
          type: "p",
          text: "Confirm Mexican fishing licenses, trip length in hours, food/drink inclusions, and what happens with catch cleaning. Get the meeting marina in writing.",
        },
        {
          type: "h3",
          text: "Cancel policy, weather, reviews, and photos",
        },
        {
          type: "p",
          text: "Read cancellation terms and weather policy before you pay. Prefer recent photos and reviews tied to the same boat — and be wary of scraped testimonials or competitor scorecards that cannot be verified.",
        },
        {
          type: "h3",
          text: "Booking transparency",
        },
        {
          type: "p",
          text: "Live calendar availability, clear deposit rules, and itemized checkout beat vague WhatsApp-only pricing. You should know what is included before you commit.",
        },
        { type: "cta" },
        {
          type: "h2",
          id: "nasty",
          text: "How Nasty Sport Fishing is structured",
        },
        {
          type: "p",
          text: "Verified from our catalog and site policies — not a claim that we are “#1 in Cabo”:",
        },
        {
          type: "ul",
          items: [
            "Private, captained charters only — guests do not run the boat.",
            "Nasty Half Day (5 hours) and Nasty Full Day (8 hours) on shared live inventory.",
            "Typical capacity up to six guests — confirm when booking.",
            "Inclusions include captain and mate, premium tackle, live bait allowance, licenses for up to four anglers, water/soft drinks/snacks/light breakfast, crew photos, and local-grounds fuel.",
            "Meet at Marina Cabo San Lucas; exact slip instructions arrive after booking.",
            "Online booking with optional add-ons in checkout; multi-day packages are inquiry-only quotes.",
            "Cancellation: free until 30 days before; 50% refund 15–30 days; non-refundable within 14 days; weather handled separately by the captain.",
            "No separate customer processing surcharge; tax calculated at checkout.",
          ],
        },
        {
          type: "p",
          text: "See boats for the Cabo 40 Express, prices for founding/standard/peak presentation, and packages if you need a coordinated multi-day quote.",
        },
        {
          type: "note",
          text: "This guide does not rank competitors or invent review scores. Compare operators on inclusions, policies, and transparency.",
        },
      ]}
      faqs={[
        {
          question: "Is Nasty a shared open boat?",
          answer:
            "No. Nasty Half Day and Nasty Full Day are private captained charters for your group.",
        },
        {
          question: "Are fishing licenses included?",
          answer:
            "Fishing licenses for up to four anglers are included on standard catalog charters. We’ll confirm coverage when you book.",
        },
        {
          question: "Can we drive the boat?",
          answer:
            "No. Charters are captained only for safety and navigation.",
        },
        {
          question: "Where do we meet?",
          answer:
            "Marina Cabo San Lucas. Exact slip and check-in details are in your confirmation email.",
        },
        {
          question: "Do you claim to be the #1 charter in Cabo?",
          answer:
            "No. We publish how we operate so you can decide fit — boat, duration, inclusions, and policies — without fake rankings.",
        },
      ]}
      related={[
        { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas charters" },
        { href: "/cabo-fishing-charter-prices", label: "Prices" },
        { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
        { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
        { href: "/boats", label: "Boats" },
        { href: "/packages", label: "Packages" },
        { href: "/los-cabos-fishing-charters", label: "Los Cabos overview" },
        { href: "/contact", label: "Contact" },
      ]}
    />
  );
}
