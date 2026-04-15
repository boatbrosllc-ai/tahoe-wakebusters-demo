"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { Experience } from "@/content/experiences";
import { BookingCTA } from "./BookingCTA";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn, getDisplayImageUrl } from "@/lib/utils";

export interface ExperienceCardProps {
  experience: Experience;
  index?: number;
  variant?: "default" | "compact";
  featured?: boolean;
  className?: string;
}

export function ExperienceCard({
  experience,
  index = 0,
  variant = "default",
  featured = false,
  className,
}: ExperienceCardProps) {
  const href = `/experiences/${experience.slug}`;
  const router = useRouter();
  const { openWithSelection } = useBookingModal();

  const handleBookNow = () => {
    openWithSelection({ experienceSlug: experience.slug });
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={className}
    >
      <Link
        href={href}
        className={cn(
          "group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
        )}
        aria-label={`${experience.title} — view details`}
      >
        <Card
          className={cn(
            "overflow-hidden border border-brand-dark/8 rounded-2xl shadow-soft-lg",
            "transition-all duration-300",
            "hover:shadow-premium hover:border-brand-primary/20 active:scale-[0.99]",
            "flex flex-col h-full",
            variant === "compact" && "flex-col",
            featured && "border-2 border-brand-primary/25 shadow-md"
          )}
        >
          <div
            className={cn(
              "relative overflow-hidden bg-brand-dark/5 shrink-0",
              variant === "default" ? "aspect-[16/10] sm:aspect-[5/3]" : "aspect-[16/9] min-h-0"
            )}
          >
            <Image
              src={getDisplayImageUrl(experience.heroImage)}
              alt=""
              fill
              className={cn(
                "object-cover transition-transform duration-500 group-hover:scale-[1.04]",
                !experience.listingCardImagePosition?.trim() && "object-center"
              )}
              style={
                experience.listingCardImagePosition?.trim()
                  ? { objectPosition: experience.listingCardImagePosition.trim() }
                  : undefined
              }
              sizes={variant === "compact" ? "(max-width: 1024px) 50vw, 25vw" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {featured && (
              <span className="absolute top-2 left-2 rounded-lg bg-brand-primary font-semibold text-brand-dark shadow-soft backdrop-blur-sm px-2.5 py-1 text-xs sm:text-sm" aria-hidden>
                Most popular
              </span>
            )}
            <span
              className={cn(
                "absolute top-2 right-2 rounded-lg bg-white/95 font-semibold text-brand-dark shadow-soft backdrop-blur-sm",
                variant === "compact" ? "px-2.5 py-1 text-xs sm:text-sm" : "top-3 right-3 px-3 py-1.5 text-sm"
              )}
              aria-hidden
            >
              {experience.duration}
            </span>
          </div>
          <div className={cn("flex flex-col flex-1 min-w-0", variant === "compact" && "flex-1 min-h-0")}>
            <CardHeader className={variant === "compact" ? "p-2 sm:p-3 pb-0" : "p-5 sm:p-6 lg:p-7 pb-0"}>
              <h3 className={cn(
                "font-bold tracking-tight text-brand-dark group-hover:text-brand-primary transition-colors",
                variant === "compact" ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"
              )}>
                {experience.title}
              </h3>
              <p className={cn(
                "text-brand-muted leading-snug",
                variant === "compact" ? "text-sm sm:text-base line-clamp-1 mt-0.5" : "text-base sm:text-lg mt-2 line-clamp-2 leading-relaxed"
              )}>
                {experience.shortDescription}
              </p>
            </CardHeader>
            <CardContent className={variant === "compact" ? "p-2 sm:p-3 pt-1" : "p-5 sm:p-6 lg:p-7 pt-3"}>
              <div className={cn(
                "flex flex-wrap items-center gap-2",
                variant === "compact" ? "text-sm" : "text-base"
              )}>
                {experience.fromPriceCents != null && (
                  <span className="font-bold text-brand-primary">
                    From ${(experience.fromPriceCents / 100).toFixed(0)}
                  </span>
                )}
                {experience.fromPriceCents != null && (
                  <span className="text-brand-muted" aria-hidden>·</span>
                )}
                <span className="text-brand-muted">{experience.duration}</span>
                <span className="text-brand-muted" aria-hidden>·</span>
                <span className="text-brand-muted">{experience.capacity}</span>
              </div>
              <ul className={cn(
                "flex flex-wrap gap-1.5",
                variant === "compact" ? "mt-1 gap-1" : "mt-2"
              )}>
                {experience.highlights.slice(0, variant === "compact" ? 2 : 3).map((h) => (
                  <li
                    key={h}
                    className={cn(
                      "rounded-full bg-brand-bg font-medium text-brand-primary",
                      variant === "compact" ? "px-2.5 py-1 text-xs sm:text-sm" : "px-3 py-1.5 text-sm"
                    )}
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </CardContent>
          </div>
          <div
            className={cn(
              "border-t border-brand-dark/5 flex flex-nowrap items-center justify-center gap-2 sm:gap-3 bg-brand-bg/30",
              variant === "compact" ? "p-2 sm:p-2.5" : "p-5 sm:p-6 lg:p-7"
            )}
          >
            <BookingCTA
              source="experience_card"
              page="home"
              experience={experience.slug}
              variant="inline"
              showCall={false}
              dense={variant === "compact"}
              onBookNowClick={handleBookNow}
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(href);
              }}
              className={cn(
                "shrink-0 inline-flex items-center justify-center font-medium border-2 border-brand-primary text-brand-primary hover:text-brand-muted hover:bg-brand-primary/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                variant === "compact"
                  ? "h-11 min-h-[44px] rounded-xl px-4 py-2.5 text-base sm:text-lg"
                  : "h-12 sm:h-14 min-h-[44px] px-5 sm:px-6 py-2.5 rounded-xl text-base sm:text-lg hover:scale-[1.02] active:scale-[0.98]"
              )}
              aria-label={`Learn more about ${experience.title}`}
            >
              Learn more
            </button>
          </div>
        </Card>
      </Link>
    </motion.article>
  );
}
