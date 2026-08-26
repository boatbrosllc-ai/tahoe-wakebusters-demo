"use client";

import React from "react";
import { motion } from "motion/react";

export type TestimonialsColumnItem = {
  text: string;
  image?: string;
  name: string;
  role: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const TestimonialsColumn = (props: {
  className?: string;
  testimonials: TestimonialsColumnItem[];
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 bg-brand-bg pb-6"
      >
        {[0, 1].map((index) => (
          <React.Fragment key={index}>
            {props.testimonials.map(({ text, image, name, role }, i) => (
              <div
                className="w-full rounded-3xl border border-brand-dark/10 bg-white p-8 shadow-lg shadow-brand-primary/10 sm:p-10"
                key={`${index}-${name}-${i}`}
              >
                <div className="text-sm leading-relaxed text-brand-dark/85">{text}</div>
                <div className="mt-5 flex items-center gap-2">
                  {image ? (
                    <img
                      width={40}
                      height={40}
                      src={image}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-sm font-semibold text-brand-primary"
                      aria-hidden
                    >
                      {initials(name)}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <div className="font-medium leading-5 tracking-tight text-brand-dark">
                      {name}
                    </div>
                    <div className="leading-5 tracking-tight text-brand-muted opacity-80">
                      {role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
};
