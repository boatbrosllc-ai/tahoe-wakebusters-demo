/**
 * Guest testimonials — adapted from public Tahoe Wakebusters reviews.
 */

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  when?: string;
  rating?: number;
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    quote:
      "Is it too much to say we have Tahoe Wakebusters to thank for one of the most fun days of our lives? We rented the pontoon for 4th of July with Jarod as our captain. Water slides, tubes, floats, a cooler, grill, and sound system — the absolute best boating experience from start to finish.",
    author: "Krysta W.",
    when: "via Yelp",
    rating: 5,
  },
  {
    id: "2",
    quote:
      "We rented for my bachelorette party and Bobby was the best driver ever!! Exceptional value — first tank of gas was free! Bobby knew the lake perfectly and took us to Emerald Bay and Camp Richardson.",
    author: "Hannah C. R.",
    when: "via Yelp",
    rating: 5,
  },
  {
    id: "3",
    quote:
      "Rented the double decker pontoon with slides and a BBQ grill — had a blast! Bobby and his team were super nice and responsive, even helped us find parking.",
    author: "Monique T.",
    when: "via Yelp",
    rating: 5,
  },
  {
    id: "4",
    quote:
      "Amazing time! Customer service was fantastic, cheaper than other places on the lake, and super flexible with scheduling. They were right on time and got us out on the lake.",
    author: "Chris R.",
    when: "via Yelp",
    rating: 5,
  },
  {
    id: "5",
    quote:
      "Boat rental with driver and tubes over Labor Day for a bachelorette party!! We couldn't have asked for a better time. Such a hidden gem.",
    author: "Paige H.",
    when: "via Yelp",
    rating: 5,
  },
];
