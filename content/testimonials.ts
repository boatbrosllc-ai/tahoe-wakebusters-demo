/**
 * Cabo sport fishing testimonials for Nasty Sport Fishing.
 * Generic names — rotate in the reviews section.
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
      "Half-day out of Cabo and we hooked dorado and a nice yellowfin. Captain and crew were sharp, tackle was dialed, and they made first-timers feel confident. Booking was easy.",
    author: "Marcus Hale",
    when: "a month ago",
    rating: 5,
  },
  {
    id: "2",
    quote:
      "Full-day charter hit the banks hard. We released a striped marlin and boxed tuna for dinner. Professional from marina check-in to the ride home past El Arco.",
    author: "Elena Vargas",
    when: "2 months ago",
    rating: 5,
  },
  {
    id: "3",
    quote:
      "Sunset trip with friends — golden light, a couple of solid bites, and a crew that kept everything fun and safe. Perfect for mixed experience levels.",
    author: "Jordan Reed",
    when: "3 months ago",
    rating: 5,
  },
  {
    id: "4",
    quote:
      "Nasty Sport Fishing delivered exactly what we wanted: licensed charter, no guesswork, and a real shot at marlin and dorado. Clear communication before the trip too.",
    author: "Priya Shah",
    when: "a month ago",
    rating: 5,
  },
  {
    id: "5",
    quote:
      "Family of five on a half-day. Kids caught their first fish offshore and the crew was patient and encouraging. Would book again next Cabo trip.",
    author: "Chris Delgado",
    when: "4 months ago",
    rating: 5,
  },
];
