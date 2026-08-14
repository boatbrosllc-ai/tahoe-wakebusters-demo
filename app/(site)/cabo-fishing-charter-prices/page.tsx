import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "Cabo fishing charter prices for Half Day and Full Day — founding vs standard rates, peak windows, inclusions, deposits, and checkout tax.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/cabo-fishing-charter-prices",
  title: "Cabo Fishing Charter Prices",
  description,
  ogImage: "/photos/stock/cabo/el-arco-sunset-jarvis.jpg",
  ogImageAlt: "Sunset near El Arco in Cabo San Lucas",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/cabo-fishing-charter-prices"
      pageKey="cabo_fishing_charter_prices"
      h1="Cabo Fishing Charter Prices"
      lede="Clear private-charter pricing for Half Day (5h) and Full Day (8h) — founding rates when active, peak Full Day windows, and what’s included before tax."
      breadcrumbName="Charter Prices"
      metaDescription={description}
      heroImage="/photos/stock/cabo/el-arco-sunset-jarvis.jpg"
      heroAlt="Sunset near El Arco in Cabo San Lucas"
      sections={[
        {
          type: "p",
          text: `${brand.companyName} publishes private charter rates for two durations on one boat calendar. The cards below pull from the same catalog used across the site — not a second pricing engine — so you see founding or standard presentation consistently.`,
        },
        {
          type: "h2",
          id: "rates",
          text: "Current charter rates",
        },
        { type: "prices" },
        {
          type: "h2",
          id: "founding",
          text: "Founding Angler vs standard",
        },
        {
          type: "p",
          text: "When Founding Angler rates are active, new holds use the launch price while the standard rate stays visible for context. Founding pricing is a temporary catalog setting — not a coupon code you type at checkout. If founding is off, the standard Half Day and Full Day rates apply.",
        },
        {
          type: "h2",
          id: "peak",
          text: "Peak and holiday Full Day windows",
        },
        {
          type: "p",
          text: "Selected peak or tournament-style dates can use a higher Full Day rate when configured on the pricing calendar. Those windows are date-specific; the live booking flow shows the price for the slot you pick.",
        },
        { type: "cta", experienceSlug: "nasty-full-day" },
        {
          type: "h2",
          id: "included",
          text: "What’s included in the base rate",
        },
        {
          type: "ul",
          items: [
            "Private boat with captain and mate",
            "Premium tackle and live bait allowance",
            "Fishing licenses for up to four anglers",
            "Water, soft drinks, snacks, and light breakfast",
            "Crew photos of the catch",
            "Local-grounds fuel",
          ],
        },
        {
          type: "h2",
          id: "addons",
          text: "Optional add-ons (examples)",
        },
        {
          type: "p",
          text: "Checkout may offer add-ons such as private resort or SJD airport transportation, premium breakfast or offshore lunch, Nasty in-house fish processing ($2–$3/lb finished weight), resort fish delivery, Nasty Gear Packs, trophy replica concierge, and film day when available. Beer/seltzer packages appear only once licensing is confirmed. For vacuum sealing and take-home estimates, see our fish processing page. Availability and prices are confirmed in the booking flow for your date — not every add-on appears on every trip.",
        },
        {
          type: "h2",
          id: "deposit-tax",
          text: "Deposits, fees, and tax",
        },
        {
          type: "ul",
          items: [
            "Deposits: when your trip date qualifies, you may be able to pay a deposit at checkout with the balance collected closer to the trip — the booking flow shows the exact amounts.",
            "Processing: there is no separate customer processing surcharge at checkout; published rates are the charter base you see.",
            "Tax: applicable tax is calculated in the booking flow. We do not publish a fixed tax percentage on this page.",
          ],
        },
        {
          type: "note",
          text: "Multi-day inquiry packages on the packages page are quote products and are not the same as Half Day / Full Day calendar rates.",
        },
      ]}
      faqs={[
        {
          question: "Do the prices include tax?",
          answer:
            "Displayed charter rates are before tax. Applicable tax is calculated at checkout in the booking flow.",
        },
        {
          question: "Is there a card processing surcharge?",
          answer:
            "No separate customer processing surcharge at checkout — published rates absorb payment-processing cost in the catalog design.",
        },
        {
          question: "Can I pay a deposit?",
          answer:
            "When the trip date qualifies and the experience allows it, checkout may offer a deposit option with the remaining balance charged closer to the charter. Exact amounts show in the booking flow.",
        },
        {
          question: "What is the cancellation policy?",
          answer:
            "Free cancellations until 30 days before start; 50% refund between 15–30 days; non-refundable within 14 days. Weather cancellations by the captain are handled separately.",
        },
        {
          question: "Are shared-boat seats available at a lower price?",
          answer:
            "No. Half Day and Full Day are private charters. Pricing is for the boat, not per shared seat.",
        },
      ]}
      related={[
        { href: "/cabo-fish-processing", label: "Cabo fish processing" },
        { href: "/experiences/nasty-half-day", label: "Half Day" },
        { href: "/experiences/nasty-full-day", label: "Full Day" },
        { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas charters" },
        { href: "/packages", label: "Packages" },
        { href: "/best-fishing-charters-cabo-san-lucas", label: "Buyer’s guide" },
        { href: "/boats/cabo-40-express", label: "Boats" },
        { href: "/contact", label: "Contact" },
      ]}
    />
  );
}
