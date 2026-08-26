import Image from "next/image";
import { cn } from "@/lib/utils";

const FOUNDERS = [
  {
    src: "/photos/wakebusters/founder-wakesurf.jpg",
    alt: "Tahoe Wakebusters founder wakesurfing on Lake Tahoe with snow-capped Sierra peaks",
    caption: "On the water",
  },
  {
    src: "/photos/wakebusters/founder-portrait.jpg",
    alt: "Tahoe Wakebusters founder — brothers Jarod and Bobby Minghini",
    caption: "Lake obsessed",
  },
] as const;

/**
 * Jarod & Bobby portrait pair for homepage about + Our Story.
 */
export function FoundersPhotos({
  className,
  showCaptions = false,
  sizes = "(max-width: 1024px) 50vw, 25vw",
}: {
  className?: string;
  showCaptions?: boolean;
  sizes?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}>
      {FOUNDERS.map((person) => (
        <figure key={person.src} className="relative min-h-0 overflow-hidden rounded-2xl bg-brand-dark">
          <div className="relative aspect-[3/4] w-full">
            <Image
              src={person.src}
              alt={person.alt}
              fill
              sizes={sizes}
              className="object-cover object-center"
            />
          </div>
          {showCaptions ? (
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0a1628]/80 to-transparent px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white sm:px-4 sm:text-xs">
              {person.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

export const founderPhotoPaths = FOUNDERS.map((p) => p.src);
export const founderPhotoAlts = FOUNDERS.map((p) => p.alt);
