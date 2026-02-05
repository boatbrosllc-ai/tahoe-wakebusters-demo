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
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className={className}
    >
      <Card
        className={cn(
          "overflow-hidden border border-brand-dark/10",
          "transition-all duration-200",
          "hover:shadow-premium active:scale-[0.99]",
          variant === "compact" && "flex flex-col sm:flex-row"
        )}
      >
        <Link
          href={href}
          className={cn(
            "block flex-1 min-w-0 group",
            variant === "compact" && "flex flex-col sm:flex-row sm:flex-1"
          )}
          aria-label={`${experience.title} — view details`}
        >
          <div
            className={cn(
              "relative overflow-hidden bg-brand-dark/5",
              variant === "default" ? "aspect-[16/10] sm:aspect-[2/1]" : "sm:w-48 sm:shrink-0 aspect-[16/10] sm:aspect-auto sm:h-full min-h-[160px]"
            )}
          >
            <Image
              src={experience.heroImage}
              alt=""
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes={variant === "compact" ? "(max-width: 640px) 100vw, 192px" : "(max-width: 640px) 100vw, 50vw"}
            />
          </div>
          <div className={cn("flex flex-col flex-1", variant === "compact" && "sm:flex-1")}>
            <CardHeader className="pb-2">
              <h3 className="text-xl font-semibold tracking-tight text-brand-dark group-hover:text-brand-primary transition-colors">
                {experience.title}
              </h3>
              <p className="text-sm text-brand-muted line-clamp-2">
                {experience.shortDescription}
              </p>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex flex-wrap gap-2 text-xs text-brand-muted">
                <span>{experience.duration}</span>
                <span aria-hidden>·</span>
                <span>{experience.capacity}</span>
              </div>
              {variant === "default" && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {experience.highlights.slice(0, 3).map((h) => (
                    <li
                      key={h}
                      className="rounded-full bg-brand-bg px-2.5 py-0.5 text-xs font-medium text-brand-primary"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter className="mt-auto pt-0">
              <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary">
                View details
                <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            </CardFooter>
          </div>
        </Link>
        <div
          className="border-t border-brand-dark/5 px-6 py-4 lg:px-6 lg:py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <BookingCTA
            source="experience_card"
            page="home"
            experience={experience.slug}
            variant="inline"
            className="sm:justify-end"
          />
        </div>
      </Card>
    </motion.article>
  );
}
