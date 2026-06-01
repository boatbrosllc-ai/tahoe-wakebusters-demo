import type { BestForItem } from "@/components/experience/BestForSection";
import type { SeoExperienceCard } from "@/components/experience/SeoExperienceCardsSection";
import type { RelatedExperienceLink } from "@/components/experience/RelatedExperiencesSection";

export const DEFAULT_TRUST_STRIP = [
  "Captain included",
  "Lake Austin",
  "Licensed & insured",
  "Instant online booking",
];

export const EXPERIENCE_CARDS_ALL: SeoExperienceCard[] = [
  {
    href: "/experiences/lake-austin-pontoon",
    title: "Lake Austin Pontoon",
    description: "Captained pontoon for groups — premium sound, lily pad, cooler included.",
  },
  {
    href: "/experiences/watersports",
    title: "Wake Boat & Wakesurf",
    description: "Private wake boat charters — wakesurfing, wakeboarding, and tubing.",
  },
  {
    href: "/experiences/sunset",
    title: "Sunset Cruise",
    description: "Public evening cruises and private sunset charters on Lake Austin.",
  },
  {
    href: "/experiences/wake-surf-club",
    title: "Wakesurf Club",
    description: "Wednesday shared wake sessions — 8 spots, beginners welcome.",
  },
];

export const RELATED_EXPERIENCES_DEFAULT: RelatedExperienceLink[] = [
  { href: "/experiences", title: "All experiences" },
  { href: "/experiences/lake-austin-pontoon", title: "Pontoon rentals" },
  { href: "/experiences/watersports", title: "Wake boat" },
  { href: "/experiences/sunset", title: "Sunset cruise" },
];

export const BEST_FOR_PARTY: BestForItem[] = [
  { iconKey: "party", label: "Birthdays", desc: "Celebrate on the water with your crew — captain handles the boat." },
  { iconKey: "users", label: "Bachelorette & bachelor", desc: "Private pontoon parties with music, lily pad, and Lake Austin scenery." },
  { iconKey: "briefcase", label: "Corporate outings", desc: "Team days and client entertainment on a calm, captained charter." },
  { iconKey: "music", label: "Group days", desc: "BYOB-friendly trips with Bluetooth sound and room for the whole group." },
];

export const BEST_FOR_GENERAL: BestForItem[] = [
  { iconKey: "party", label: "Parties & celebrations", desc: "Birthdays, reunions, and group days on a private captained charter." },
  { iconKey: "heart", label: "Couples & date nights", desc: "Sunset cruises and calm-water charters perfect for two." },
  { iconKey: "users", label: "Families", desc: "Swim, float on the lily pad, and explore Lake Austin coves safely." },
  { iconKey: "briefcase", label: "Corporate groups", desc: "Professional, captained experiences without anyone driving the boat." },
];

export const BEST_FOR_WAKE: BestForItem[] = [
  { iconKey: "waves", label: "First-time wakesurfers", desc: "Captain and boat set up for beginners — get up with coaching on the water." },
  { iconKey: "users", label: "Small groups", desc: "Private wake boat for your crew — rotate riders all charter long." },
  { iconKey: "sun", label: "Wednesday club", desc: "Shared Wakesurf Club sessions — book a single spot online." },
  { iconKey: "shield", label: "No license needed", desc: "Licensed captain runs the boat while you focus on riding." },
];

export const PONTOON_COMPARISON = {
  comparisonLeftHeading: "Pontoon",
  comparisonRightHeading: "Wake boat",
  comparisonHeadline: "Pontoon vs wake boat on Lake Austin",
  comparisonRows: [
    { label: "Best for", left: "Groups, parties, swimming", right: "Wakesurf, wakeboard, tubing" },
    { label: "Capacity", left: "Up to 14 guests", right: "Smaller rider-focused groups" },
    { label: "Pace", left: "Chill cruise & anchor", right: "Active riding & coaching" },
    { label: "Captain", left: "Included", right: "Included" },
  ],
};
