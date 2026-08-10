import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "Los Cabos fishing charters explained — the region vs Cabo San Lucas city, and where Nasty Sport Fishing operates from Marina Cabo San Lucas.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/los-cabos-fishing-charters",
  title: "Los Cabos Fishing Charters",
  description,
  ogImage: "/photos/stock/cabo/aerial-lands-end-clark.jpg",
  ogImageAlt: "Aerial view of Land’s End and Cabo San Lucas coastline",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/los-cabos-fishing-charters"
      pageKey="los_cabos_fishing_charters"
      h1="Los Cabos Fishing Charters"
      lede="Los Cabos is a region. Cabo San Lucas is a city. Here’s how that maps to where Nasty Sport Fishing actually departs — and how to book without guessing the wrong marina."
      breadcrumbName="Los Cabos Fishing Charters"
      metaDescription={description}
      heroImage="/photos/stock/cabo/aerial-lands-end-clark.jpg"
      heroAlt="Aerial view of Land’s End and Cabo San Lucas coastline"
      sections={[
        {
          type: "h2",
          id: "region-vs-city",
          text: "Los Cabos vs Cabo San Lucas",
        },
        {
          type: "p",
          text: "“Los Cabos” commonly refers to the broader Baja tip area that includes Cabo San Lucas, San José del Cabo, and the corridor between them. Travelers often search “Los Cabos fishing charters” while staying in a hotel along that corridor — then need a clear answer about where the boat actually leaves from.",
        },
        {
          type: "p",
          text: "Cabo San Lucas is the city at Land’s End, home to Marina Cabo San Lucas. That marina is where Nasty Sport Fishing meets guests for day charters. We are not describing every marina or harbor across the peninsula — just our operating area.",
        },
        {
          type: "h2",
          id: "where-we-operate",
          text: "Where Nasty operates",
        },
        {
          type: "p",
          text: "Nasty Sport Fishing runs private charters from the Marina Cabo San Lucas area. Exact slip and dock instructions come in your confirmation after you book. If you are staying in San José del Cabo or the Tourist Corridor, plan transfer time to Cabo San Lucas for check-in — resort transportation can be added as an optional checkout add-on when offered.",
        },
        { type: "cta" },
        {
          type: "h2",
          id: "what-to-book",
          text: "What to book for a Los Cabos trip",
        },
        {
          type: "p",
          text: "Day fishing still uses the same two private products: Nasty Half Day (5 hours) and Nasty Full Day (8 hours). Multi-day itineraries with lodging or tournament weeks are inquiry packages — not the same as selecting a date on the charter calendar. Start with experiences for day trips, packages for coordinated quote requests, or contact if your group needs something custom.",
        },
        {
          type: "h2",
          id: "planning",
          text: "Planning notes for corridor guests",
        },
        {
          type: "ul",
          items: [
            "Confirm marina meeting details in your booking email — do not assume a hotel dock pickup unless arranged.",
            "Build buffer for morning traffic between San José / corridor resorts and Cabo San Lucas.",
            "Use the fishing calendar and best-time guide for season questions; the captain still sets the daily plan.",
            "Review charter prices before you compare “Los Cabos” quotes that mix shared boats, different marina bases, or unclear inclusions.",
          ],
        },
        {
          type: "note",
          text: "This page is about geography and logistics. For trip format, inclusions, and species overview, see Cabo San Lucas Fishing Charters.",
        },
      ]}
      faqs={[
        {
          question: "Do you pick up at every Los Cabos hotel?",
          answer:
            "Standard charters meet at Marina Cabo San Lucas. Resort transportation may be available as an optional add-on when offered in checkout — ask when booking if you need a transfer arranged.",
        },
        {
          question: "Is San José del Cabo the same departure as Cabo San Lucas?",
          answer:
            "No. Our day charters depart from the Marina Cabo San Lucas area. Guests staying in San José should plan travel time to Cabo San Lucas for check-in.",
        },
        {
          question: "Are Los Cabos multi-day packages the same as Half Day / Full Day?",
          answer:
            "No. Multi-day packages are inquiry-only quote products. Day charters book online as Nasty Half Day or Nasty Full Day on the live calendar.",
        },
        {
          question: "What is the cancellation policy?",
          answer:
            "Free cancellations until 30 days before start; 50% refund between 15–30 days; non-refundable within 14 days. Weather cancellations by the captain are handled separately.",
        },
      ]}
      related={[
        { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas charters" },
        { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
        { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
        { href: "/cabo-fishing-charter-prices", label: "Prices" },
        { href: "/packages", label: "Packages" },
        { href: "/best-fishing-charters-cabo-san-lucas", label: "How to choose a charter" },
        { href: "/contact", label: "Contact" },
        { href: "/location", label: "Location" },
      ]}
    />
  );
}
