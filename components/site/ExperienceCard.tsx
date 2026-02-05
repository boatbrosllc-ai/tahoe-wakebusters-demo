"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { Experience } from "@/content/experiences";
import { BookingCTA } from "./BookingCTA";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ExperienceCardProps {
  experience: Experience;
  index?: number;
  variant?: "default" | "compact";
  className?: string;
}

export function ExperienceCard({
  experience,
  index = 0,
  variant = "default",
  className,
}: ExperienceCardProps) {
  const href = `/experiences/${experience.slug}`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={className}
    >
      <Card
        className={cn(
          "overflow-hidden border border-brand-dark/8 rounded-2xl shadow-soft-lg",
          "transition-all duration-300",
          "hover:shadow-premium hover:border-brand-primary/20 active:scale-[0.99]",
          "flex flex-col h-full",
          variant === "compact" && "sm:flex-row"
        )}
      >
        <Link
          href={href}
          className={cn(
            "flex flex-col flex-1 min-w-0 group",
            variant === "compact" && "sm:flex-row sm:flex-1"
          )}
          aria-label={`${experience.title} — view details`}
        >
          <div
            className={cn(
              "relative overflow-hidden bg-brand-dark/5 shrink-0",
              variant === "default" ? "aspect-[16/10] sm:aspect-[5/3]" : "sm:w-48 sm:shrink-0 aspect-[16/10] sm:aspect-auto sm:h-full min-h-[140px] sm:min-h-[160px]"
            )}
          >
            <Image
              src={experience.heroImage}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              sizes={variant === "compact" ? "(max-width: 640px) 100vw, 192px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {/* Duration badge on image */}
            <span
              className="absolute top-3 right-3 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-dark shadow-soft backdrop-blur-sm"
              aria-hidden
            >
              {experience.duration}
            </span>
          </div>
          <div className={cn("flex flex-col flex-1 min-w-0", variant === "compact" && "sm:flex-1")}>
            <CardHeader className="p-5 sm:p-6 lg:p-7 pb-0">
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-brand-dark group-hover:text-brand-primary transition-colors">
                {experience.title}
              </h3>
              <p className="text-sm sm:text-base text-brand-muted line-clamp-2 mt-2 leading-relaxed">
                {experience.shortDescription}
              </p>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 lg:p-7 pt-3">
              <div className="flex flex-wrap gap-2 text-sm text-brand-muted">
                <span>{experience.duration}</span>
                <span aria-hidden>·</span>
                <span>{experience.capacity}</span>
              </div>
              {variant === "default" && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {experience.highlights.slice(0, 3).map((h) => (
                    <li
                      key={h}
                      className="rounded-full bg-brand-bg px-3 py-1 text-xs font-medium text-brand-primary"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter className="mt-auto p-5 sm:p-6 lg:p-7 pt-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary group-hover:gap-2 transition-all">
                View details
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </span>
            </CardFooter>
          </div>
        </Link>
        <div
          className="border-t border-brand-dark/5 p-5 sm:p-6 lg:p-7 flex items-center justify-center sm:justify-end bg-brand-bg/30"
          onClick={(e) => e.stopPropagation()}
        >
          <BookingCTA
            source="experience_card"
            page="home"
            experience={experience.slug}
            variant="inline"
          />
        </div>
      </Card>
    </motion.article>
  );
}
