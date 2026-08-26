"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Marquee } from "@/components/ui/marquee-01-utils/marquee";
import { testimonials } from "@/content/testimonials";

export type MarqueeReview = {
  name: string;
  username: string;
  body: string;
  profile?: string;
};

const defaultReviews: MarqueeReview[] = testimonials.map((t) => ({
  name: t.author,
  username: t.when ?? "Guest",
  body: t.quote,
}));

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const ReviewCard = ({
  profile,
  name,
  username,
  body,
}: MarqueeReview) => {
  return (
    <Card className="relative h-full min-h-[10.5rem] w-72 cursor-default overflow-hidden border-brand-dark/10 bg-white p-4 shadow-none sm:w-80">
      <CardContent className="flex flex-col gap-2 p-0">
        <div className="flex flex-row items-center gap-2">
          <Avatar className="h-8 w-8">
            {profile ? <AvatarImage src={profile} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <p className="text-sm font-medium text-brand-dark">{name}</p>
            <p className="text-xs font-medium text-brand-muted">{username}</p>
          </div>
        </div>
        <p className="line-clamp-4 text-sm leading-relaxed text-brand-dark/85">{body}</p>
      </CardContent>
    </Card>
  );
};

export default function TestimonialMarquee({
  reviews = defaultReviews,
}: {
  reviews?: MarqueeReview[];
}) {
  const firstRow = reviews.slice(0, Math.ceil(reviews.length / 2));
  const secondRow = reviews.slice(Math.ceil(reviews.length / 2));

  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:28s]">
        {firstRow.map((review, i) => (
          <ReviewCard key={`${review.name}-${i}`} {...review} />
        ))}
      </Marquee>
      <Marquee reverse pauseOnHover className="[--duration:32s]">
        {secondRow.map((review, i) => (
          <ReviewCard key={`${review.name}-${i}`} {...review} />
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-brand-bg" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-brand-bg" />
    </div>
  );
}
