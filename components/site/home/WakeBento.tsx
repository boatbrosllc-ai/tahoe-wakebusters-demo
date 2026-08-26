"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { homepageCopy } from "@/content/homepage";
import { cn } from "@/lib/utils";
import {
  AnchorIcon,
  FerryIcon,
  GaugeIcon,
  HelmIcon,
  SailboatIcon,
  TallShipIcon,
} from "@/components/site/icons/nautical";

type CardTone = "photo" | "lifted" | "liftedOrange" | "teal" | "orange";

const reasons: {
  icon: typeof GaugeIcon;
  title: string;
  body: string;
  tone: CardTone;
  span?: string;
}[] = [
  {
    icon: GaugeIcon,
    title: "Everything included",
    body: "Gas, tubes, boards, skis, coolers, and premium Bluetooth stereo. One flat rate — no fuel surprise on the way out.",
    tone: "photo",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    icon: TallShipIcon,
    title: "Premium fleet",
    body: "Bennington tritoons, Mastercraft wakesurf boats, and custom double-decker party barges.",
    tone: "orange",
  },
  {
    icon: FerryIcon,
    title: "Tahoe Keys Marina",
    body: "Easy South Shore access from Highway 50 and the hotels. Delivery and multi-day available.",
    tone: "lifted",
  },
  {
    icon: HelmIcon,
    title: "Real local knowledge",
    body: "A decade of cove-by-cove Tahoe knowledge no booking widget can fake.",
    tone: "teal",
  },
  {
    icon: AnchorIcon,
    title: "Safety first",
    body: "Full briefing. USCG captains. Life jackets and gear stocked for every guest.",
    tone: "liftedOrange",
  },
  {
    icon: SailboatIcon,
    title: "Any occasion",
    body: "Birthdays, bachelorettes, weddings, corporate, 4th of July. Groups of 2 to 40+.",
    tone: "lifted",
  },
];

/**
 * Why book — photo hero, solid teal/orange cards, navy lifted cards.
 */
export function WakeBento() {
  return (
    <section
      id="why-us"
      className="relative scroll-mt-28 overflow-visible bg-brand-dark px-5 py-20 sm:px-8 sm:py-24 lg:scroll-mt-32 lg:px-14 xl:px-20"
      aria-label="Why Book With Tahoe Wakebusters"
    >
      <div
        className="pointer-events-none absolute -right-24 top-0 h-[28rem] w-[28rem] rounded-full bg-brand-primary/12 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-brand-secondary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-10 text-center lg:mb-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-primary">
            {homepageCopy.whyUs.eyebrow}
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {homepageCopy.whyUs.h2}
          </h2>
        </div>

        <div className="grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reasons.map((reason, i) => (
            <motion.article
              key={reason.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className={cn(
                "group relative flex flex-col rounded-[1.5rem] transition duration-300",
                reason.span,
                reason.tone === "photo" && "z-10 h-full overflow-visible rounded-none",
                reason.tone !== "photo" && "overflow-hidden",
                (reason.tone === "lifted" || reason.tone === "liftedOrange") &&
                  "border border-white/10 bg-[#143049] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:-translate-y-0.5 hover:border-brand-primary/40 hover:bg-[#183a58] sm:p-7",
                reason.tone === "teal" &&
                  "border border-transparent bg-brand-primary p-6 text-white shadow-[0_12px_40px_-16px_rgba(0,180,216,0.55)] hover:-translate-y-0.5 sm:p-7",
                reason.tone === "orange" &&
                  "border border-transparent bg-brand-secondary p-6 text-white shadow-[0_12px_40px_-16px_rgba(255,107,43,0.55)] hover:-translate-y-0.5 sm:p-7"
              )}
            >
              {reason.tone === "photo" ? (
                <div className="relative h-full min-h-[20rem] md:min-h-[24rem]">
                  <div className="absolute inset-x-0 bottom-0 top-1/2 rounded-[1.5rem] border border-white/15 bg-[#123047]" />
                  <div className="absolute inset-x-0 bottom-0 top-0 [clip-path:inset(0_round_0_0_1.5rem_1.5rem)]">
                    <Image
                      src="/photos/wakebusters/include-swan.png"
                      alt="Guest on a swan float holding an American flag on a Tahoe Wakebusters Lake Tahoe charter"
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 66vw"
                      className="object-cover object-[center_60%]"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 top-1/2 z-10 flex flex-col justify-end bg-gradient-to-t from-[#0a1628] via-[#0a1628]/50 to-transparent p-7 sm:p-9">
                    <span className="mb-3 inline-flex w-fit items-center rounded-full bg-brand-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-dark">
                      All-inclusive
                    </span>
                    <h3 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                      {reason.title}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
                      {reason.body}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <span className="relative flex size-11 items-center justify-center rounded-2xl bg-white/20 text-white">
                    <reason.icon className="h-5 w-5 text-white" aria-hidden />
                  </span>
                  <h3 className="relative mt-5 font-display text-xl font-extrabold text-white">
                    {reason.title}
                  </h3>
                  <p
                    className={cn(
                      "relative mt-2 text-sm leading-relaxed",
                      reason.tone === "teal" || reason.tone === "orange"
                        ? "text-white/90"
                        : "text-white/65"
                    )}
                  >
                    {reason.body}
                  </p>
                </>
              )}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
