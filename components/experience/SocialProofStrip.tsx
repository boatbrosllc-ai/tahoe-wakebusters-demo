"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { SOCIAL_PROOF, SOCIAL_AVATARS, SOCIAL_LINE } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

export function SocialProofStrip() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      className="bg-brand-dark border-y border-white/10 py-4"
      initial={reduceMotion ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide pb-2 -mx-5 px-5 sm:mx-0 sm:px-0">
          {SOCIAL_PROOF.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className="flex-shrink-0 flex flex-col items-center gap-0.5"
            >
              <span className="text-white font-semibold text-lg">{item.label}</span>
              {item.sub && (
                <span className="text-white/60 text-xs">{item.sub}</span>
              )}
            </div>
          ))}
          <div className="flex-shrink-0 flex items-center gap-2 pl-4 border-l border-white/20">
            <div className="flex -space-x-2">
              {SOCIAL_AVATARS.map((src, i) => (
                <div
                  key={src}
                  className="relative w-8 h-8 rounded-full border-2 border-brand-dark overflow-hidden bg-white/20"
                >
                  <Image
                    src={src}
                    alt=""
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <span className="text-white/80 text-sm whitespace-nowrap">{SOCIAL_LINE}</span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
