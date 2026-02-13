/**
 * Global FAQs. TODO: Load from CMS; merge with experience-specific FAQs.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const faqs: FaqItem[] = [
  {
    id: "what-included",
    question: "What's included in the rental?",
    answer:
      "Boat, fuel for the rental period, life vests (all sizes), a captain, and basic safety gear. Cooler and Bluetooth stereo on pontoons. Optional add-ons: tubes, wake gear.",
  },
  {
    id: "need-license",
    question: "Do I need a boating license?",
    answer:
      "In Texas, you don't need a license for recreational boating. Every charter includes a licensed captain who handles the boat so you can relax and enjoy the day.",
  },
  {
    id: "cancel-reschedule",
    question: "What's your cancellation and reschedule policy?",
    answer:
      "Free reschedule with 48+ hours notice. Cancellations within 48 hours may forfeit deposit. We'll work with you on weather-related reschedules.",
  },
  {
    id: "where-pickup",
    question: "Where do we pick up the boat?",
    answer:
      "We're on Lake Austin. Exact address and dock instructions are sent after booking. Plenty of parking available.",
  },
  {
    id: "weather",
    question: "What if the weather is bad?",
    answer:
      "We monitor weather closely. If conditions are unsafe, we'll reschedule at no charge. Light rain may still be fine; we'll call you to discuss.",
  },
  {
    id: "bring",
    question: "What should we bring?",
    answer:
      "Sunscreen, water, snacks/drinks (no glass), and a valid ID. We provide life vests and safety gear. Bring a cooler if you want extra drinks.",
  },
];
