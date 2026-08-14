import Image from "next/image";
import { siteConfig } from "@/config/site";

const STORIES = [
  {
    title: "Sunrise, no itinerary",
    body: "Coffee on the bow. We idle until the lake is yours. Half days start when you want them to feel like mornings.",
    image: siteConfig.media.galleryFallback,
    imageAlt: "Boat at sunset",
    flip: false,
  },
  {
    title: "Stay out until the light goes gold",
    body: "Full days are for the long loop — swimming, drifting, a late lunch in a quiet pocket of the shoreline.",
    image: siteConfig.media.boats,
    imageAlt: "Boat on open water",
    flip: true,
  },
];

export function AbcBoatsStoryRows() {
  return (
    <section className="abc-home-stories bg-[#fffaf4] px-6 py-16 sm:px-10 lg:py-24" aria-labelledby="abc-stories-heading">
      <h2 id="abc-stories-heading" className="sr-only">
        How a day feels
      </h2>
      <div className="mx-auto flex max-w-6xl flex-col gap-16 lg:gap-24">
        {STORIES.map((story) => (
          <article key={story.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-[2.5rem] ${story.flip ? "lg:order-2" : ""}`}>
              <Image src={story.image} alt={story.imageAlt} fill className="object-cover" sizes="(max-width: 1023px) 100vw, 50vw" />
            </div>
            <div className={story.flip ? "lg:pr-6" : "lg:pl-6"}>
              <p className="text-xs uppercase tracking-[0.22em] text-[#e85d4c]">a day with us</p>
              <h3 className="mt-3 font-display text-3xl leading-tight text-[#16332f] sm:text-4xl">{story.title}</h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-[#3d5c56]">{story.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
