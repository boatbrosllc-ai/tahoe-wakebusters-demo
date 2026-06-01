/**
 * Austin boat rental pillar page — FAQs, resource hub, and shared copy.
 */

import type { FAQItem } from "@/components/experience/FAQ";
import { getFaqById } from "@/content/faqs";

const icePolicy = getFaqById("ice")!;

export const AUSTIN_BOAT_RENTAL_FAQ: FAQItem[] = [
  {
    question: "How much does an Austin boat rental cost?",
    answer:
      "Pontoon charters on Lake Austin start from $450 for a 3-hour trip; longer rentals and peak weekends cost more. Wake surf and watersports boats start from about $600. Sunset cruises run from $35 per ticket for a 1-hour scenic cruise. Holiday tours are $45 per ticket for 1.5 hours. All captained charters include fuel, a cooler, and your licensed captain.",
  },
  {
    question: "Is a captain included?",
    answer:
      "Yes. Every Boat Bros Austin boat rental includes a licensed captain. You relax, swim, and celebrate while your captain handles navigation, docking, and safety.",
  },
  {
    question: "Do I need a boating license?",
    answer:
      "No. Because every rental is captained, no one in your group needs a boating license or experience. Your captain runs the boat from start to finish.",
  },
  {
    question: "How many people can fit on the boat?",
    answer:
      "Our pontoons accommodate up to 14 guests per boat. For larger groups, we can coordinate double-boat charters so everyone gets on the water together.",
  },
  {
    question: "Where do we meet?",
    answer:
      "We meet at Loop 360 Boat Ramp, 5019 N Capital of Texas Hwy, Austin, TX 78746. Your booking confirmation includes exact meet-up time and captain contact for the day of your trip.",
  },
  {
    question: "Can we bring food and drinks?",
    answer:
      `Yes. Bring snacks and drinks in cans or plastic—no glass and no styrofoam on Lake Austin. ${icePolicy.answer} Red wine is not allowed.`,
  },
  {
    question: "What is the cancellation policy?",
    answer:
      "Free cancellations until 30 days before your booking start time. Cancellations 15–30 days out receive a 50% refund. Cancellations within 14 days of the start time are non-refundable.",
  },
  {
    question: "What's the difference between Lake Austin and Lake Travis?",
    answer:
      "Lake Austin is about 10 minutes from downtown Austin, stays at a constant water level, and is where Boat Bros launches. Lake Travis is 35–45 minutes away, water levels fluctuate, and most Austin visitors prefer Lake Austin for parties, families, and easy day trips without a long drive.",
  },
  {
    question: "Can we drive the boat ourselves?",
    answer:
      "No. Boat Bros is captained-only. You cannot rent a self-drive boat from us. That keeps your group safe and lets everyone enjoy the day.",
  },
  {
    question: "What happens in bad weather?",
    answer:
      "We reschedule when possible. The captain may cancel if conditions are unsafe—typically below 55°F or winds over 20 mph. Light rain or overcast skies often still make for a great day on the water.",
  },
];

/** Supporting articles in the SEO cluster (Firestore CMS slugs). */
export const AUSTIN_BOAT_RENTAL_RESOURCE_LINKS: { href: string; title: string; description: string }[] = [
  {
    href: "/blog/austin-boat-rental-complete-guide",
    title: "Austin Boat Rental: The Complete Guide to Lake Austin",
    description: "Types of boats, booking steps, and what's included.",
  },
  {
    href: "/blog/boat-rentals-austin-tx-guide",
    title: "Boat Rentals Austin TX: Everything You Need to Know",
    description: "Lakes near Austin, costs, and how to choose an operator.",
  },
  {
    href: "/blog/lake-austin-pontoon-rental-guide",
    title: "Lake Austin Pontoon Rental Guide",
    description: "Pricing, capacity, and what to expect on a pontoon day.",
  },
  {
    href: "/blog/captained-boat-rental-austin",
    title: "Captained Boat Rental Austin",
    description: "Why captain-included beats self-drive for most groups.",
  },
  {
    href: "/blog/lake-austin-birthday-party-boat-rental",
    title: "Lake Austin Birthday Party Boat Rental",
    description: "Ideas, decorations, and planning tips.",
  },
  {
    href: "/blog/austin-bachelor-party-boat-rental-guide",
    title: "Austin Bachelor Party Boat Rental Guide",
    description: "Best boats, timing, and what to bring.",
  },
  {
    href: "/blog/austin-bachelorette-party-boat-rental-guide",
    title: "Austin Bachelorette Party Boat Rental Guide",
    description: "Plan the perfect Lake Austin bachelorette day.",
  },
  {
    href: "/blog/corporate-boat-rental-austin-lake-austin",
    title: "Corporate Boat Rental Austin",
    description: "Team outings and company events on Lake Austin.",
  },
  {
    href: "/blog/family-boat-rental-lake-austin",
    title: "Family Boat Rental Lake Austin",
    description: "Kids, life jackets, pets, and family-friendly coves.",
  },
  {
    href: "/blog/lake-austin-sunset-cruise-guide",
    title: "Lake Austin Sunset Cruise Guide",
    description: "Times, tickets, and what to expect at golden hour.",
  },
  {
    href: "/blog/lake-austin-vs-lake-travis-boat-rental",
    title: "Lake Austin vs. Lake Travis for Boat Rentals",
    description: "Honest comparison for parties, families, and proximity.",
  },
  {
    href: "/blog/austin-boat-rental-cost-pricing-guide",
    title: "Austin Boat Rental Cost & Pricing Guide",
    description: "2025 rates, deposits, and what's included.",
  },
  {
    href: "/blog/best-things-to-do-lake-austin",
    title: "Best Things to Do on Lake Austin",
    description: "Swimming, coves, Pennybacker Bridge, and more.",
  },
  {
    href: "/blog/lake-austin-boat-rental-with-captain",
    title: "Lake Austin Boat Rental with Captain",
    description: "What your captain handles and why it matters.",
  },
  {
    href: "/blog/austin-party-boat-rental-options",
    title: "Austin Party Boat Rental Options",
    description: "Pontoon, wake boat, and sunset party options.",
  },
  {
    href: "/blog/lake-austin-waterfront-restaurants-guide",
    title: "Lake Austin Waterfront Restaurants",
    description: "Where to eat before or after your boat day.",
  },
  {
    href: "/blog/what-to-wear-lake-austin-boat-rental",
    title: "What to Wear on a Lake Austin Boat Rental",
    description: "Outfits, shoes, and sun protection for pontoon days.",
  },
];
