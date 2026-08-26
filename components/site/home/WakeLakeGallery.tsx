"use client";

import InteractiveImageBentoGallery from "@/components/ui/bento-gallery";

/** Mixed tall/short spans for the two-row drag bento: tall, short, short, repeat. */
const lakeMoments = [
  { id: 1, title: "Party barge", desc: "Dual slides, grill, whole crew.", url: "/photos/wakebusters/party-barge.jpg", span: "row-span-2" },
  { id: 2, title: "Lily pad", desc: "Toys included. Tahoe turquoise.", url: "/photos/wakebusters/lilypad.jpg", span: "row-span-1" },
  { id: 3, title: "Bachelor energy", desc: "Birthdays, lake days, the whole crew.", url: "/photos/wakebusters/group-guys.jpg", span: "row-span-1" },
  { id: 4, title: "Top deck", desc: "The boat that made us famous.", url: "/photos/wakebusters/party-crew.jpg", span: "row-span-2" },
  { id: 5, title: "Wakebusters", desc: "Family owned. Lake obsessed.", url: "/photos/wakebusters/life-ring.jpg", span: "row-span-1" },
  { id: 6, title: "Bachelorette", desc: "The one they'll still talk about.", url: "/photos/wakebusters/bachelorette.jpg", span: "row-span-1" },
  { id: 7, title: "Jump in", desc: "Slides, flips, and cold lake water.", url: "/photos/wakebusters/gallery-2.jpg", span: "row-span-2" },
  { id: 8, title: "Say I do", desc: "Weddings on the water.", url: "/photos/wakebusters/wedding.jpg", span: "row-span-1" },
  { id: 9, title: "Float day", desc: "The yellow mat always comes out.", url: "/photos/wakebusters/gallery-1.jpg", span: "row-span-1" },
  { id: 10, title: "Girls trip", desc: "Visors on. Lake day locked.", url: "/photos/wakebusters/group-women.jpg", span: "row-span-2" },
  { id: 11, title: "On the water", desc: "The double decker that made us famous.", url: "/photos/wakebusters/hero-slides.jpg", span: "row-span-1" },
  { id: 12, title: "Life ring", desc: "South Lake Tahoe, on the boat.", url: "/photos/wakebusters/life-ring-2.jpg", span: "row-span-1" },
  { id: 13, title: "Packed out", desc: "This is what a full charter looks like.", url: "/photos/wakebusters/party-full.jpg", span: "row-span-2" },
  { id: 14, title: "Bride tribe", desc: "Wigs, champagne, lake day.", url: "/photos/wakebusters/neon-wigs.jpg", span: "row-span-1" },
  { id: 15, title: "Beached", desc: "Sand still warm.", url: "/photos/wakebusters/party-barge-2.jpg", span: "row-span-1" },
  { id: 16, title: "Whole crew", desc: "Groups of 2 to 40+.", url: "/photos/wakebusters/hero-mobile.jpg", span: "row-span-2" },
  { id: 17, title: "Top rail", desc: "That Tahoe blue behind you.", url: "/photos/wakebusters/life-ring-deck.jpg", span: "row-span-1" },
  { id: 18, title: "On deck", desc: "The shot everyone sends home.", url: "/photos/wakebusters/life-ring-deck-2.jpg", span: "row-span-1" },
  { id: 19, title: "Upper deck", desc: "Flags out. Lake day locked.", url: "/photos/wakebusters/group-guys-2.jpg", span: "row-span-2" },
  { id: 20, title: "Candid", desc: "This is the actual day.", url: "/photos/wakebusters/crew.jpg", span: "row-span-1" },
  { id: 21, title: "Party mode", desc: "Grill on. Speakers up.", url: "/photos/wakebusters/party-barge-deck.jpg", span: "row-span-1" },
  { id: 22, title: "Backflip", desc: "The lake is the pool.", url: "/photos/wakebusters/backflip-2.jpg", span: "row-span-2" },
  { id: 23, title: "Stern crew", desc: "Clear water. Easy day.", url: "/photos/wakebusters/group-guys-stern.jpg", span: "row-span-1" },
  { id: 24, title: "I do", desc: "Vows with a Tahoe backdrop.", url: "/photos/wakebusters/wedding-2.jpg", span: "row-span-1" },
  { id: 25, title: "Lake boys", desc: "From the top deck looking back.", url: "/photos/wakebusters/group-guys-high.jpg", span: "row-span-2" },
  { id: 26, title: "That Tahoe blue", desc: "Snow still on the peaks.", url: "/photos/wakebusters/tahoe-shoreline.jpg", span: "row-span-1" },
  { id: 27, title: "From above", desc: "Docks, turquoise, deeper blue.", url: "/photos/wakebusters/tahoe-aerial.jpg", span: "row-span-1" },
  { id: 28, title: "Golden hour", desc: "The drive down to the lake.", url: "/photos/wakebusters/tahoe-twilight.jpg", span: "row-span-2" },
];

export function WakeLakeGallery() {
  return (
    <InteractiveImageBentoGallery
      imageItems={lakeMoments}
      eyebrow="Life on the water"
      title="On the lake"
      description="Nothing sells a Tahoe day better than seeing one. Drag to explore — click any shot to go full screen."
      className="w-full -mt-px"
    />
  );
}
