/**
 * Content for event-specific landing pages (bachelorette, bachelor party).
 * Same structure as pontoon experience; copy tailored to each audience.
 */

import type { FAQItem } from "@/components/experience/FAQ";

export interface EventLandingContent {
  slug: "bachelorette" | "bachelor";
  hero: {
    title: string;
    subtitle: string;
    introParagraph: string;
  };
  overview: {
    headline: string;
    story: string;
    seoParagraphs: string[];
    timeline: { step: string; desc: string }[];
  };
  faq: FAQItem[];
  finalCta: {
    headline: string;
    primaryCta: string;
    secondaryCta?: string;
    secondaryHref?: string;
  };
}

export const BACHELORETTE_EVENT_CONTENT: EventLandingContent = {
  slug: "bachelorette",
  hero: {
    title: "Lake Austin Bachelorette Party Boat Rentals",
    subtitle: "Captained pontoon. Premium sound. Lily pad. Celebrate on the water.",
    introParagraph:
      "Our Lake Austin bachelorette party boat rentals are captained pontoon experiences designed for celebrations. No boating license required—your group relaxes while a licensed captain runs the boat. Book your bachelorette boat day below.",
  },
  overview: {
    headline: "Why it's perfect for a bachelorette party",
    story:
      "A captained pontoon on Lake Austin is built for bachelorette groups: spacious seating, Bluetooth music, a floating lily pad for swimming, and calm water. Your captain handles everything so the bride and crew can focus on the celebration.",
    seoParagraphs: [
      "Our pontoon has room for the whole squad—comfortable seating, shade, and space to move around. The Bluetooth sound system keeps the playlist going while you cruise to popular spots like Party Cove. Lake Austin’s calm water is ideal for swimming, floating on the lily pad, and taking photos without the boat rocking.",
      "The relaxed, celebratory atmosphere is exactly what bachelorette groups look for: no one has to drive, everyone can enjoy drinks and snacks (no glass), and the captain knows the best coves and timing. Many groups combine the boat day with brunch beforehand or dinner at Ski Shores or downtown after.",
    ],
    timeline: [
      { step: "Dock", desc: "Meet your captain & board" },
      { step: "Cruise", desc: "Scenic Lake Austin" },
      { step: "Party Cove", desc: "Anchor & celebrate" },
      { step: "Swim", desc: "Lily pad & photos" },
      { step: "Return", desc: "Golden hour or head to dinner" },
    ],
  },
  faq: [
    {
      question: "Can we bring champagne or drinks?",
      answer:
        "Yes. You may bring your own drinks and snacks. Glass is not allowed on the boat—please use cans, plastic, or plastic cups for champagne. We provide a cooler and ice.",
    },
    {
      question: "Can we decorate the boat?",
      answer:
        "Yes, within reason. Banners, balloons, and tasteful decorations are fine as long as they don’t block the captain’s view or blow into the water. Avoid confetti or anything that could harm the lake. When in doubt, ask when you book.",
    },
    {
      question: "Do you go to Party Cove?",
      answer:
        "Yes. Our captains know Lake Austin well and can take you to popular spots including Party Cove when conditions and traffic allow. We’ll position the boat so your group can enjoy the vibe safely.",
    },
    {
      question: "How many people can fit on the boat?",
      answer:
        "Our pontoon can accommodate up to 14 guests. For larger bachelorette groups, we can discuss multiple boats or timing so everyone gets on the water.",
    },
    {
      question: "Can we play our own music?",
      answer:
        "Yes. We have a premium Bluetooth sound system on board. Connect your phone and play your playlist. We ask that volume stays respectful near shore and other boats.",
    },
    {
      question: "What should we bring for the trip?",
      answer:
        "Sunscreen, water, a soft-sided cooler with drinks and snacks (no glass), towels, waterproof phone case or bag, and dry clothes for the ride back. Life jackets and ice are provided. Bring any decorations you’ve agreed on with us.",
    },
  ],
  finalCta: {
    headline: "Ready for the best bachelorette day on Lake Austin?",
    primaryCta: "Check Availability",
    secondaryCta: "Text us",
    secondaryHref: "#",
  },
};

export const BACHELOR_EVENT_CONTENT: EventLandingContent = {
  slug: "bachelor",
  hero: {
    title: "Lake Austin Bachelor Party Boat Rentals",
    subtitle: "Captained pontoon. Fuel included. Cooler, lily pad, premium sound.",
    introParagraph:
      "Our Lake Austin bachelor party boat rentals are captained pontoon experiences built for groups. No boating license required—your crew relaxes while a licensed captain runs the boat. Book your bachelor boat day below.",
  },
  overview: {
    headline: "Why it's perfect for a bachelor party",
    story:
      "A captained pontoon on Lake Austin gives your group space to hang out, swim, and hit the best spots without anyone having to drive. Bluetooth music, cooler and ice, and a lily pad are all included—you just show up.",
    seoParagraphs: [
      "Spacious seating fits the whole crew. The premium Bluetooth sound system, cooler with ice, and floating lily pad make it easy to cruise, anchor at popular coves, and swim. Lake Austin’s calm water and access to spots like Party Cove create a relaxed, celebratory vibe that bachelor parties love.",
      "Because every trip is captained, no one is stuck at the wheel. Your captain handles navigation, positioning, and safety so the group can focus on the day. Fuel is included, and we’ll work with you on timing so you can extend or add hours when available.",
    ],
    timeline: [
      { step: "Dock", desc: "Meet your captain" },
      { step: "Cruise", desc: "Scenic Lake Austin" },
      { step: "Cove", desc: "Anchor & hang" },
      { step: "Swim", desc: "Lily pad & water" },
      { step: "Return", desc: "Head back or extend" },
    ],
  },
  faq: [
    {
      question: "Is alcohol allowed on board?",
      answer:
        "Yes. You may bring your own drinks for adults of legal drinking age. We ask that everyone drinks responsibly and follows the captain’s instructions. Glass is not allowed—use cans or plastic.",
    },
    {
      question: "Can we swim during the trip?",
      answer:
        "Yes. Swimming off the boat is part of the experience. We provide a giant floating lily pad and life jackets. Your captain will anchor in safe, calm spots for swimming.",
    },
    {
      question: "Do you provide coolers and ice?",
      answer:
        "Yes. A cooler and ice are included with every rental. Bring your own drinks and snacks; we’ll keep them cold.",
    },
    {
      question: "Can we extend our time on the water?",
      answer:
        "Often yes, depending on availability and the captain’s schedule. Ask when you book or message us the day of; we’ll do our best to add time if possible.",
    },
    {
      question: "What are the most popular stops on Lake Austin?",
      answer:
        "Captains often stop at popular coves and areas like Party Cove when conditions allow. Lake Austin has calm water, scenic shoreline, and spots that work for swimming and hanging out. Your captain will choose the best spots for your group and the conditions.",
    },
    {
      question: "How many people fit?",
      answer:
        "Our pontoon can accommodate up to 14 guests. For larger bachelor parties, we can discuss multiple boats or back-to-back slots.",
    },
  ],
  finalCta: {
    headline: "Ready for the best bachelor day on Lake Austin?",
    primaryCta: "Check Availability",
    secondaryCta: "Text us",
    secondaryHref: "#",
  },
};

export function getEventContent(slug: "bachelorette" | "bachelor"): EventLandingContent {
  return slug === "bachelorette" ? BACHELORETTE_EVENT_CONTENT : BACHELOR_EVENT_CONTENT;
}
