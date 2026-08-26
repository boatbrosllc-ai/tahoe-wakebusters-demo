"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import { brand } from "@/content/brand";
import { homepageCopy } from "@/content/homepage";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { TextReveal } from "@/components/ui/cascade-text";
import { analytics } from "@/lib/analytics";
import { getPublicPhone } from "@/lib/seo/public-contact";

const copy = homepageCopy.hero;
/** Brand orange cascade hover — matches Book CTA */
const HERO_CASCADE_HOVER = "#ff6b2b";

/**
 * Full-bleed photographic hero with centered copy.
 * Bottom of the photo fades to white into the fleet section.
 */
export function WakeHero() {
  const { setOpen } = useBookingModal();
  const phone = getPublicPhone();

  return (
    <section
      className="relative h-[100svh] min-h-[640px] overflow-hidden bg-white text-white"
      aria-label={`${brand.companyName} — South Lake Tahoe boat rentals`}
    >
      <div className="absolute inset-0">
        <Image
          src="/photos/wakebusters/hero-live.jpg"
          alt={copy.imageAlt}
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-[center_58%]"
        />
        <div className="absolute inset-0 bg-black/20" aria-hidden />
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,22,40,0.52)_0%,rgba(10,22,40,0.36)_48%,rgba(10,22,40,0.18)_72%,transparent_90%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-t from-white from-[18%] via-white/75 to-transparent"
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 pb-28 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-20">
        <TextReveal
          as="h1"
          text={copy.h1}
          color="#ffffff"
          hoverColor={HERO_CASCADE_HOVER}
          fontSize="clamp(1.2rem, calc((100vw - 3rem) / 15.4), 6.5rem)"
          className="w-max max-w-none shrink-0 cursor-default whitespace-nowrap font-display font-black tracking-[-0.03em] drop-shadow-[0_8px_32px_rgba(10,22,40,0.65)]"
          style={{ padding: 0 }}
        />

        <div className="mx-auto mt-4 w-max max-w-[calc(100vw-2rem)] space-y-1.5 text-center sm:mt-5 sm:max-w-none sm:space-y-2">
          <p
            className="whitespace-nowrap font-medium leading-none text-white drop-shadow-[0_2px_12px_rgba(10,22,40,0.55)]"
            style={{ fontSize: "clamp(0.7rem, calc((100vw - 2rem) / 42), 1.25rem)" }}
          >
            {copy.subhead.split(" ").join("\u00A0")}
          </p>
          <p className="text-sm leading-snug text-white/85 drop-shadow-[0_2px_10px_rgba(10,22,40,0.5)] sm:text-base">
            {copy.subheadDetail}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:mt-8 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              analytics.bookCtaClick("hero", "home");
              setOpen(true);
            }}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-secondary px-6 text-sm font-bold text-white shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-14 sm:px-8 sm:text-base"
          >
            {copy.primaryCta}
          </button>
          {phone ? (
            <a
              href={`tel:${phone.tel}`}
              onClick={() => analytics.callClick("hero", "home")}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-primary px-5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-14 sm:px-6 sm:text-base"
            >
              Call {phone.display}
            </a>
          ) : null}
        </div>

        <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white sm:hidden">
          {Array.from({ length: 5 }).map((_, star) => (
            <Star key={star} className="h-3.5 w-3.5 fill-[#f5b301] text-[#f5b301]" aria-hidden />
          ))}
          <span className="ml-1">{copy.trust[0]}</span>
        </div>

        <div className="mt-6 hidden flex-wrap items-center justify-center gap-x-3.5 gap-y-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-white sm:flex">
          {copy.trust.map((item, i) => (
            <span key={item} className="inline-flex items-center gap-x-3.5">
              {i > 0 ? <span className="hidden text-white/70 sm:inline">·</span> : null}
              {i === 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  {Array.from({ length: 5 }).map((_, star) => (
                    <Star
                      key={star}
                      className="h-3.5 w-3.5 fill-[#f5b301] text-[#f5b301]"
                      aria-hidden
                    />
                  ))}
                  <span className="ml-1">{item}</span>
                </span>
              ) : (
                <span>{item}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
