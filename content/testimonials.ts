import { brand } from "@/content/brand";
/**
 * Guest testimonials — placeholder copy for the platform development site.
 */

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  /** Optional: "a month ago", "6 months ago", etc. */
  when?: string;
  rating?: number;
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    quote:
      "Booked a half-day online and everything was straightforward. Captain and crew were sharp, and first-timers in our group felt looked after.",
    author: "Marcus Hale",
    when: "a month ago",
    rating: 5,
  },
  {
    id: "2",
    quote:
      "Full-day trip was well run from dock check-in to the ride home. Clear communication before we arrived.",
    author: "Elena Vargas",
    when: "2 months ago",
    rating: 5,
  },
  {
    id: "3",
    quote:
      "Sunset trip with friends — golden light and a crew that kept everything fun and safe. Perfect for mixed experience levels.",
    author: "Jordan Reed",
    when: "3 months ago",
    rating: 5,
  },
  {
    id: "4",
    quote:
      `${brand.companyName} delivered exactly what we wanted: a private captained boat, no guesswork, and an easy booking flow.`,
    author: "Priya Shah",
    when: "a month ago",
    rating: 5,
  },
  {
    id: "5",
    quote:
      "Family of five on a half-day. The crew was patient and encouraging. We would book again.",
    author: "Chris Delgado",
    when: "4 months ago",
    rating: 5,
  },
];
