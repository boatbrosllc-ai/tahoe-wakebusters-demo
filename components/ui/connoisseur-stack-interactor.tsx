"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export interface ConnoisseurMenuItem {
  num: string;
  name: string;
  clipId: string;
  image: string;
  /** SVG image placement — crop so the subject fills the 500×500 viewBox. */
  imageX?: number;
  imageY?: number;
  imageWidth?: number;
  imageHeight?: number;
}

const defaultItems: ConnoisseurMenuItem[] = [
  {
    num: "01",
    name: "Gourmet Burgers",
    clipId: "clip-original",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80",
  },
  {
    num: "02",
    name: "Fresh Desserts",
    clipId: "clip-hexagons",
    image:
      "https://images.unsplash.com/photo-1551024601-bec78aea704b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80",
  },
  {
    num: "03",
    name: "Artisan Waffles",
    clipId: "clip-pixels",
    image:
      "https://images.unsplash.com/photo-1562376552-0d160a2f238d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80",
  },
];

function splitName(name: string) {
  const words = name.trim().split(/\s+/);
  const mid = Math.max(1, Math.ceil(words.length / 2));
  return {
    top: words.slice(0, mid).join(" "),
    bottom: words.slice(mid).join(" "),
  };
}

export function ConnoisseurStackInteractor({
  items = defaultItems,
  className,
}: {
  items?: ConnoisseurMenuItem[];
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<SVGImageElement>(null);
  const mainGroupRef = useRef<SVGGElement>(null);
  const masterTl = useRef<gsap.core.Timeline | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const createLoop = (index: number) => {
    const list = itemsRef.current;
    const item = list[index];
    if (!item || !containerRef.current || !imageRef.current || !mainGroupRef.current) {
      return;
    }

    const nodes = containerRef.current.querySelectorAll(`#${item.clipId} .path`);
    if (!nodes.length) return;

    if (masterTl.current) masterTl.current.kill();

    const img = imageRef.current;
    img.setAttribute("href", item.image);
    img.setAttribute("x", String(item.imageX ?? 0));
    img.setAttribute("y", String(item.imageY ?? 0));
    img.setAttribute("width", String(item.imageWidth ?? 500));
    img.setAttribute("height", String(item.imageHeight ?? 500));
    mainGroupRef.current.setAttribute("clip-path", `url(#${item.clipId})`);

    gsap.set(nodes, { scale: 0, transformOrigin: "50% 50%" });

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });

    tl.to(nodes, {
      scale: 1,
      duration: 0.8,
      stagger: { amount: 0.4, from: "random" },
      ease: "expo.out",
    })
      .to(nodes, {
        scale: 1.05,
        duration: 1.5,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
        stagger: { amount: 0.2, from: "center" },
      })
      .to(nodes, {
        scale: 0,
        duration: 0.6,
        stagger: { amount: 0.3, from: "edges" },
        ease: "expo.in",
      });

    masterTl.current = tl;
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      createLoop(activeIndex);
    }, containerRef);
    return () => {
      masterTl.current?.kill();
      ctx.revert();
    };
  }, [activeIndex]);

  const handleItemHover = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-h-screen w-full flex-col items-center justify-between overflow-hidden bg-white p-8 transition-colors duration-500 md:flex-row md:p-24",
        className
      )}
    >
      <div className="z-20 w-full md:w-1/2">
        <nav>
          <ul className="flex flex-col gap-10 lg:gap-14">
            {items.map((item, index) => {
              const { top, bottom } = splitName(item.name);
              return (
                <li
                  key={item.num}
                  onMouseEnter={() => handleItemHover(index)}
                  onFocus={() => handleItemHover(index)}
                  tabIndex={0}
                  className="group cursor-pointer"
                >
                  <div className="flex items-start gap-6">
                    <span
                      className={cn(
                        "mt-2 text-3xl font-bold transition-all duration-500",
                        activeIndex === index
                          ? "scale-110 text-brand-secondary"
                          : "text-brand-muted"
                      )}
                    >
                      {item.num}
                    </span>
                    <h3
                      className={cn(
                        "font-display text-4xl font-black uppercase leading-[0.85] tracking-tighter transition-all duration-700 sm:text-5xl md:text-6xl",
                        activeIndex === index
                          ? "translate-x-4 text-brand-dark opacity-100"
                          : "translate-x-0 text-brand-muted/70 opacity-40"
                      )}
                    >
                      {top}
                      {bottom ? (
                        <>
                          <br />
                          {bottom}
                        </>
                      ) : null}
                    </h3>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="relative mt-16 flex w-full items-center justify-center md:mt-0 md:w-1/2">
        <div className="absolute h-[120%] w-[120%] rounded-full bg-brand-secondary/10 blur-[120px] transition-opacity duration-1000" />

        <svg
          viewBox="0 0 500 500"
          className="z-10 h-auto w-full max-w-[500px] drop-shadow-xl"
        >
          <defs>
            <clipPath id="clip-original">
              <rect className="path" x="28" y="8" width="444" height="130" rx="18" />
              <rect className="path" x="12" y="144" width="476" height="166" rx="18" />
              <rect className="path" x="28" y="316" width="444" height="176" rx="18" />
            </clipPath>

            <clipPath id="clip-hexagons">
              <rect className="path" x="12" y="8" width="218" height="296" rx="10" />
              <rect className="path" x="12" y="310" width="218" height="182" rx="10" />
              <rect className="path" x="236" y="8" width="252" height="152" rx="10" />
              <rect className="path" x="236" y="166" width="123" height="168" rx="10" />
              <rect className="path" x="365" y="166" width="123" height="168" rx="10" />
              <rect className="path" x="236" y="340" width="252" height="152" rx="10" />
            </clipPath>

            {/* Wide stacked bands — better for portrait UI screenshots */}
            <clipPath id="clip-calendar">
              <rect className="path" x="8" y="6" width="484" height="152" rx="16" />
              <rect className="path" x="8" y="164" width="484" height="168" rx="16" />
              <rect className="path" x="8" y="338" width="484" height="156" rx="16" />
            </clipPath>

            <clipPath id="clip-pixels">
              {Array.from({ length: 9 }).map((_, i) => (
                <rect
                  key={i}
                  className="path"
                  x={(i % 3) * 162 + 8}
                  y={Math.floor(i / 3) * 162 + 8}
                  width="156"
                  height="156"
                  rx="4"
                />
              ))}
            </clipPath>
          </defs>

          <g ref={mainGroupRef} clipPath={`url(#${items[0].clipId})`}>
            <image
              ref={imageRef}
              href={items[0].image}
              x={items[0].imageX ?? 0}
              y={items[0].imageY ?? 0}
              width={items[0].imageWidth ?? 500}
              height={items[0].imageHeight ?? 500}
              preserveAspectRatio="xMidYMin slice"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

/** 21st.dev export name */
export const Component = ConnoisseurStackInteractor;
