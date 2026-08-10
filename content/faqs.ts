/**
 * Global FAQs — Nasty Sport Fishing Cabo charter policy and FAQ content.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export function getFaqById(id: string): FaqItem | undefined {
  return faqs.find((f) => f.id === id);
}

export const faqs: FaqItem[] = [
  {
    id: "cancellation-policy",
    question: "What is your cancellation policy?",
    answer:
      "Free cancellations until 30 days before the charter start time. 50% refund for cancellations between 15–30 days before start. Cancellations within 14 days of the start time are non-refundable. Weather cancellations by the captain are handled separately (see below).",
  },
  {
    id: "bad-weather",
    question: "What happens if there is bad weather?",
    answer:
      "Safety comes first. Overcast skies or light chop are normal for Cabo and usually do not cancel a trip. If wind, seas, or conditions are unsafe, the captain may delay, shorten, or cancel. When we cancel for weather, we will reschedule or refund per the booking terms. We’ll communicate as early as conditions allow.",
  },
  {
    id: "tipping-captain",
    question: "Tipping the captain and crew",
    answer:
      "Gratuity for captain and crew is customary on Cabo charters — typically 15–20% of the charter price when you’ve had a great day. You can tip in cash or ask us about adding a tip on card. If something didn’t meet expectations, email info@nastysportfishing.com with details so we can make it right.",
  },
  {
    id: "tip-on-card",
    question: "Can I leave a tip on the card?",
    answer:
      "Yes — ask us at booking or after the trip and we can add a tip to the card on file when available.",
  },
  {
    id: "split-payment",
    question: "Can we split the payment?",
    answer:
      "We can split payment in two. Among your group, Venmo or similar apps work well for settling up.",
  },
  {
    id: "whats-included",
    question: "What’s included on the charter?",
    answer:
      "Licensed captain and crew, tackle, bait, and ice are included on standard charters. Bring sunscreen, soft-soled shoes, sunglasses, and any drinks or snacks you want (soft coolers preferred). Specific inclusions are confirmed when you book.",
  },
  {
    id: "licenses",
    question: "Do I need a Mexican fishing license?",
    answer:
      "Fishing licenses for guests are typically arranged as part of the charter. We’ll confirm what’s covered when you book so you’re legal on the water.",
  },
  {
    id: "minimum-booking",
    question: "Is there a minimum charter length?",
    answer:
      "Half-day trips are our most popular minimum. Full-day and sunset options are also available depending on season and the bite.",
  },
  {
    id: "what-we-target",
    question: "What fish do you target?",
    answer:
      "Depending on season and conditions: striped marlin, yellowfin tuna, dorado (mahi), wahoo, and mixed bag species. Cabo’s Pacific and Sea of Cortez waters change day to day — the captain picks the plan for the best shot.",
  },
  {
    id: "drive-boat",
    question: "Can we run the boat ourselves?",
    answer:
      "No. Nasty Sport Fishing charters are captained only. You fish; we handle the boat, safety, and navigation.",
  },
  {
    id: "seasickness",
    question: "What if someone gets seasick?",
    answer:
      "If you’re prone to motion sickness, take preventative medication before departure and stay midship with a horizon view. Morning trips and calmer days help. Tell the crew early if someone feels off.",
  },
  {
    id: "bring-food-drink",
    question: "Can I bring food and drinks?",
    answer:
      "Yes — soft coolers, cans, and plastic are preferred. No glass on deck when possible. Keep alcohol responsible; the captain has the final say on safety.",
  },
  {
    id: "where-meet",
    question: "Where do we meet?",
    answer:
      "We meet at Marina Cabo San Lucas. Exact slip, dock instructions, and check-in time are in your confirmation email. Arrive a bit early so we can load coolers and brief everyone before departure.",
  },
  {
    id: "catch-keep",
    question: "Can we keep what we catch?",
    answer:
      "Yes within Mexican regulations and size limits. Many guests keep fish for dinner or ask about local cleaning/filleting options. Billfish are often catch-and-release — we’ll guide you on the day.",
  },
  {
    id: "kids",
    question: "Are kids allowed?",
    answer:
      "Yes on private charters when weather and trip length make sense. Life jackets are available; bring a well-fitting vest for young children if you have one. Ask us about the best trip length for families.",
  },
  {
    id: "how-many",
    question: "How many anglers per trip?",
    answer:
      "Typical private charters accommodate up to 6 guests. Confirm capacity when you book — more people can mean less time with a rod in hand.",
  },
  {
    id: "experience-needed",
    question: "Do I need fishing experience?",
    answer:
      "No. First-timers are welcome. The crew will set lines, coach technique, and help with hookups so you can focus on the fight.",
  },
  {
    id: "radio",
    question: "Is there music / Bluetooth on the boat?",
    answer:
      "Most trips have Bluetooth audio so you can play a playlist. Volume stays reasonable so we can hear bites and radios.",
  },
  {
    id: "lost-found",
    question: "Do you have a lost & found?",
    answer:
      "Email info@nastysportfishing.com or call the number on your confirmation as soon as you notice something missing. We’ll check the boat and marina.",
  },
];
