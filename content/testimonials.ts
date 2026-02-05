/**
 * Testimonials for social proof. TODO: Load from CMS.
 */

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role?: string;
  rating?: number;
  experience?: string;
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    quote: "Best day on the lake we've had. The boat was spotless and the process was seamless. We'll book again.",
    author: "Sarah M.",
    role: "Austin",
    rating: 5,
    experience: "Pontoon Party",
  },
  {
    id: "2",
    quote: "Our corporate group had a blast. Professional from start to finish. Highly recommend for team outings.",
    author: "James K.",
    role: "Team lead",
    rating: 5,
    experience: "Corporate Outing",
  },
  {
    id: "3",
    quote: "The sunset cruise was perfect for our anniversary. Easy booking and the captain knew the best spots.",
    author: "Rachel & Tom",
    role: "Austin",
    rating: 5,
    experience: "Sunset Cruise",
  },
  {
    id: "4",
    quote: "Kids had a blast and we felt safe the whole time. Life vests for everyone and a calm cove for swimming.",
    author: "Mike D.",
    role: "Dad of three",
    rating: 5,
    experience: "Family Day",
  },
  {
    id: "5",
    quote: "Bachelorette party was a hit. Captain took care of everything so we could just enjoy the day.",
    author: "Jessica L.",
    role: "Bride-to-be",
    rating: 5,
    experience: "Bachelor / Bachelorette",
  },
];
