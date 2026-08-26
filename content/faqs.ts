import { brand } from "@/content/brand";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export function getFaqById(id: string): FaqItem | undefined {
  return faqs.find((f) => f.id === id);
}

/** Homepage FAQ block — order matches the SEO copy brief. */
export const HOMEPAGE_FAQ_IDS = [
  "gas-included",
  "drive-boat",
  "whats-included",
  "capacity",
  "departures",
  "north-shore",
  "occasions",
  "delivery",
  "bad-weather",
  "how-to-book",
] as const;

export function getHomepageFaqs(): FaqItem[] {
  return HOMEPAGE_FAQ_IDS.map((id) => getFaqById(id)).filter((f): f is FaqItem => Boolean(f));
}

export const faqs: FaqItem[] = [
  {
    id: "gas-included",
    question: "Is gas really included in your boat rentals?",
    answer:
      "Yes. Every Tahoe Wakebusters charter includes a full tank of gas at no extra charge. Most Lake Tahoe boat rental companies charge you for fuel on return — we build it into the rate so you know the number before you leave the dock.",
  },
  {
    id: "drive-boat",
    question: "Do I need a captain to rent a boat on Lake Tahoe?",
    answer:
      "With us, yes — every charter runs with a USCG-certified captain. It means no boater education card, no navigating the Tahoe Keys channel yourself, and no one in your group stuck driving all day. Captain fees are quoted separately and confirmed before you book.",
  },
  {
    id: "whats-included",
    question: "What's included with a Tahoe boat rental?",
    answer:
      "Full tank of gas, water toys and floaties, tubes, coolers, premium Bluetooth stereo, and life jackets and safety gear for every guest. Wakesurf charters add boards, wakeboards, and skis. The party barge adds a BBQ grill and dual waterslides.",
  },
  {
    id: "capacity",
    question: "How many people can you accommodate?",
    answer:
      "Individual boats hold 10 to 13 guests. For larger groups we run multiple boats together — we regularly handle parties of 40 or more.",
  },
  {
    id: "departures",
    question: "Where do your Lake Tahoe boat rentals depart from?",
    answer:
      "All charters depart from Tahoe Keys Marina in South Lake Tahoe, CA. Arrive 20 minutes early for parking and loading (first come, first served).",
  },
  {
    id: "north-shore",
    question: "Do you serve North Lake Tahoe?",
    answer:
      "We operate out of South Lake Tahoe. If you're staying on the North Shore, we're roughly an hour's drive around the lake — plenty of our guests make the trip. Delivery may be available; call to ask.",
  },
  {
    id: "occasions",
    question: "What occasions do you handle?",
    answer:
      "Bachelor and bachelorette parties, birthdays, weddings, corporate outings, family reunions, and 4th of July. After ten years, we've probably done your occasion.",
  },
  {
    id: "delivery",
    question: "Do you offer boat delivery?",
    answer: `Delivery and multi-day rentals are available on request. Call ${brand.phone} for pricing.`,
  },
  {
    id: "bad-weather",
    question: "What happens if the weather is bad?",
    answer:
      "We run a flexible weather policy. If Tahoe doesn't cooperate, we work with you to reschedule.",
  },
  {
    id: "how-to-book",
    question: "How do I book?",
    answer: `Reserve online for instant confirmation, or call ${brand.phone} to talk it through first.`,
  },
  {
    id: "life-jackets",
    question: "Are life jackets provided?",
    answer:
      "All life jackets are included. Children 12 and under are required to wear a vest at all times — we outfit them at the start of the charter.",
  },
  {
    id: "parking",
    question: "Do you offer parking?",
    answer:
      "Parking is available at Tahoe Keys Marina and is first come, first served. Arrive 20 minutes early for parking and loading.",
  },
  {
    id: "cancellation-policy",
    question: "What is your cancellation policy?",
    answer:
      "Cancel up to 7 days before your charter for a full refund. If weather doesn't cooperate, we'll work with you on a rain check or full refund. No-shows without notice are non-refundable.",
  },
  {
    id: "pets",
    question: "Are pets allowed?",
    answer:
      "Well-behaved pets are welcome aboard. Let us know in advance so we can make sure your furry friend has a great day too.",
  },
  {
    id: "what-to-bring",
    question: "What should we bring?",
    answer:
      "Ice, food & beverages, towels, sunscreen, personal medications, and a downloaded playlist (cell service can be spotty). Limit glass — bring solo cups.",
  },
];
