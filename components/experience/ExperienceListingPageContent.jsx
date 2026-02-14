"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, X, Check, ShieldCheck, Clock, Users, Calendar, HelpCircle, Quote, Images, ChevronRight, Music2, Umbrella, LifeBuoy, Leaf, Snowflake, Sparkles } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { getDisplayImageUrl } from "@/lib/utils";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { ExperienceCalendarSection } from "./ExperienceCalendarSection";

const easing = [0.22, 1, 0.36, 1];

const sectionReveal = (reduceMotion) => reduceMotion
  ? {}
  : { initial: { opacity: 0, y: 32 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.6, ease: easing } };

const staggerContainer = (reduceMotion) => reduceMotion
  ? {}
  : { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "-60px" }, variants: { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } } };

const staggerItem = (reduceMotion) => reduceMotion
  ? {}
  : { variants: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }, transition: { duration: 0.4, ease: easing } };

/** Pick an icon for an included-item label (e.g. "Cooler" → Snowflake). */
function getIncludedIcon(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("cooler") || l.includes("ice")) return Snowflake;
  if (l.includes("bluetooth") || l.includes("stereo") || l.includes("music")) return Music2;
  if (l.includes("shade") || l.includes("canopy") || l.includes("umbrella")) return Umbrella;
  if (l.includes("life") || l.includes("vest") || l.includes("jacket") || l.includes("pfd")) return LifeBuoy;
  if (l.includes("lilly") || l.includes("lily") || l.includes("pad") || l.includes("float")) return Leaf;
  if (l.includes("good") && l.includes("vibes")) return Sparkles;
  return Check;
}

const INCLUDED_ACCENT_CLASSES = [
  "bg-brand-primary/12 text-brand-primary",
  "bg-brand-muted/12 text-brand-muted",
  "bg-brand-secondary/12 text-brand-secondary",
];

export function ExperienceListingPageContent(props) {
  const { data } = props;
  const reduceMotion = useReducedMotion();
  const { openWithSelection } = useBookingModal();
  const { id, experience, rates, addons } = data;
  const fromPrice = rates.length > 0 ? Math.min(...rates.map((r) => r.priceCents)) : null;
  const ctaText = experience.ctaButtonText?.trim() || "Book now";
  const bookHref = `/experiences/${experience.slug}/book`;
  const heroOverlay = experience.heroOverlayText?.trim() || (fromPrice != null ? `From $${(fromPrice / 100).toFixed(0)}` : null);
  const cancellationSummary = experience.cancellationSummary?.trim();
  const testimonials = experience.testimonials?.filter((t) => t.name || t.quote) ?? [];
  const gallery = experience.gallery ?? [];
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // #region agent log
  useEffect(() => {
    const hasCancellation = !!(cancellationSummary || experience.cancellationPolicy?.fullText);
    const included = experience.included ?? [];
    const lastIncludedLabel = included.length > 0 ? included[included.length - 1]?.trim().replace(/\.$/, "") : null;
    const lastAccentIndex = included.length > 0 ? (included.length - 1) % 3 : null;
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "ExperienceListingPageContent.jsx", message: "Good vibes visibility debug", data: { hasCancellation, includedCount: included.length, lastIncludedLabel, lastAccentIndex, goodVibesSpanClassName: "text-lg font-bold text-[#001c30] tracking-tight block" }, timestamp: Date.now(), hypothesisId: "A" }) }).catch(() => {});
  }, [cancellationSummary, experience.cancellationPolicy?.fullText, experience.included]);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!goodVibesSpanRef.current) {
        fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "ExperienceListingPageContent.jsx", message: "Good vibes span ref null", data: {}, timestamp: Date.now(), hypothesisId: "D" }) }).catch(() => {});
        return;
      }
      const el = goodVibesSpanRef.current;
      const cs = typeof window !== "undefined" ? window.getComputedStyle(el) : null;
      const rect = el.getBoundingClientRect?.();
      fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "ExperienceListingPageContent.jsx", message: "Good vibes span DOM/computed", data: { textContent: el.textContent, opacity: cs?.opacity, color: cs?.color, fontSize: cs?.fontSize, width: rect?.width, height: rect?.height }, timestamp: Date.now(), hypothesisId: "C" }) }).catch(() => {});
    });
    return () => cancelAnimationFrame(id);
  }, [cancellationSummary, experience.cancellationPolicy?.fullText]);
  // #endregion

  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
    };
    if (lightboxIndex != null) {
      document.addEventListener("keydown", onEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [lightboxIndex]);

  const motionProps = reduceMotion ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } } : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: easing } };
  const calendarRef = useRef(null);
  const goodVibesSpanRef = useRef(null);
  const scrollToCalendar = () => calendarRef.current?.scrollIntoView({ behavior: "smooth" });

  const descriptionLong = (experience.descriptionLong || experience.description || "").trim();
  const descriptionFirstLine = descriptionLong.split("\n")[0] || descriptionLong;
  const descriptionRest = descriptionLong.split("\n").filter(Boolean).slice(1);

  const contentWidth = "max-w-5xl mx-auto px-6 sm:px-8 lg:px-10";

  return (
    <div className="pb-32 lg:pb-0 bg-brand-dark min-h-screen">
      {/* Hero – clean, contained */}
      <section className="relative w-full min-h-[75vh] overflow-hidden bg-brand-dark">
        {experience.heroMedia?.url ? (
          <Image
            src={getDisplayImageUrl(experience.heroMedia.url)}
            alt=""
            fill
            className={
              (experience.slug === "pontoon" || experience.slug === "sunset")
                ? "object-cover object-[center_65%]"
                : "object-cover object-center"
            }
            priority
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-muted/20 to-brand-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 from-35% via-black/25 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end pb-16 sm:pb-20 lg:pb-24">
          <div className={contentWidth + " relative"}>
            <Link
              href="/experiences"
              className="inline-flex items-center gap-2 text-white/70 text-sm hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All trips
            </Link>
            <motion.h1
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.05]"
              initial={motionProps.initial ?? { opacity: 0, y: 16 }}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.1 }}
            >
              {experience.title}
            </motion.h1>
            <motion.p
              className="mt-4 text-lg sm:text-xl text-white/90 max-w-xl leading-relaxed"
              initial={motionProps.initial ?? { opacity: 0, y: 12 }}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.15 }}
            >
              {experience.subtitle}
            </motion.p>
          </div>
        </div>
      </section>

      {/* Mobile sticky bar */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-30 flex flex-col gap-0 border-t border-brand-dark/10 bg-white/95 backdrop-blur-xl px-4 py-3 lg:hidden"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.4 }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-brand-dark block">
              {fromPrice != null ? `From $${(fromPrice / 100).toFixed(0)}` : "See dates"}
            </span>
            <span className="text-xs text-brand-muted">Free to hold · Cancel anytime</span>
          </div>
          <Button asChild size="lg" className="rounded-full shrink-0">
            <Link href={bookHref}>Reserve your spot</Link>
          </Button>
        </div>
      </motion.div>

      {/* Strip – icons + color, larger */}
      <motion.section
        className="border-y-2 border-brand-primary/25 bg-gradient-to-r from-black/50 via-brand-dark/80 to-black/50 py-6 sm:py-8"
        initial={reduceMotion ? false : { opacity: 0 }}
        whileInView={reduceMotion ? {} : { opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: easing }}
      >
        <div className={contentWidth + " flex flex-wrap items-center justify-between gap-5 sm:gap-6"}>
          <p className="text-white/90 text-base sm:text-lg font-medium">
            {fromPrice != null ? (
              <>Trips starting at <span className="font-bold text-brand-primary">${(fromPrice / 100).toFixed(0)}</span></>
            ) : null}
            {fromPrice != null && <span className="text-white/70 mx-1.5">·</span>}
            <span>{getMaxGuestsForExperience(experience)} person max</span>
          </p>
          <button
            type="button"
            onClick={scrollToCalendar}
            className="inline-flex items-center gap-2 text-brand-primary font-semibold text-base sm:text-lg hover:text-brand-primary/90 hover:gap-2.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
          >
            See dates & times <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
          </button>
        </div>
      </motion.section>

      {/* About – motion + color accent, centered */}
      <motion.section className={"py-16 sm:py-20 lg:py-24 relative overflow-hidden text-center " + contentWidth} {...sectionReveal(reduceMotion)}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary/40" aria-hidden />
        <motion.p
          className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-snug tracking-tight max-w-3xl mx-auto mt-6"
          {...(reduceMotion ? {} : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5, ease: easing } })}
        >
          {descriptionFirstLine}
        </motion.p>
        <motion.div className="mt-6 text-white/80 text-lg leading-relaxed max-w-2xl mx-auto space-y-3" {...(descriptionRest.length > 0 ? staggerContainer(reduceMotion) : {})}>
          {descriptionRest.map((line, i) => (
            <motion.p key={i} {...(descriptionRest.length > 0 ? staggerItem(reduceMotion) : {})}>{line.trim()}</motion.p>
          ))}
          <motion.p className="mt-6 text-white/60 italic flex items-center justify-center gap-2" {...(descriptionRest.length > 0 ? staggerItem(reduceMotion) : {})}>
            <Quote className="h-5 w-5 text-brand-primary/60 shrink-0" aria-hidden />
            We can&apos;t wait to get you on the water.
          </motion.p>
        </motion.div>
      </motion.section>

      {/* What's included – custom icons, refined colors, premium cards */}
      {(experience.included?.length > 0 || experience.location || cancellationSummary || experience.cancellationPolicy?.fullText) && (
        <motion.section className="relative py-16 sm:py-20 lg:py-24 bg-white overflow-hidden" {...sectionReveal(reduceMotion)}>
          {/* Subtle top accent band */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand-primary/60 to-transparent" aria-hidden />
          <div className={contentWidth + " relative"}>
            {/* Heading – left accent bar, no thick underline */}
            <div className="flex items-start gap-4 mb-10">
              <div className="mt-1.5 w-1 rounded-full h-12 bg-gradient-to-b from-brand-primary to-brand-muted shrink-0" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-muted mb-1">Details</p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight">What&apos;s included</h2>
              </div>
            </div>

            {/* Included items – per-item icons, rotating accent colors */}
            {experience.included?.length > 0 && (
              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12" {...staggerContainer(reduceMotion)}>
                {[...experience.included
                  .map((item) => item.trim().replace(/\.$/, ""))
                  .filter((label) => label.length > 0), "Good vibes"]
                  .map((label, i) => {
                  const Icon = getIncludedIcon(label);
                  const accent = INCLUDED_ACCENT_CLASSES[i % INCLUDED_ACCENT_CLASSES.length];
                  return (
                    <motion.div
                      key={i}
                      {...staggerItem(reduceMotion)}
                      className="group flex items-center gap-4 rounded-2xl border-[3px] border-brand-dark/10 bg-white px-5 py-4 shadow-md shadow-brand-dark/5 transition-all duration-200 hover:border-brand-primary/30 hover:shadow-lg hover:shadow-brand-primary/10 hover:bg-brand-bg/30 focus-within:ring-2 focus-within:ring-brand-primary/30 focus-within:ring-offset-2"
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent} transition-colors duration-200 group-hover:opacity-90`}>
                        <Icon className="h-5 w-5" aria-hidden strokeWidth={2.25} />
                      </span>
                      <span className="shrink-0 font-medium text-brand-dark text-sm sm:text-base">{label}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Location & Cancellation – premium cards with distinct palettes */}
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6" {...staggerContainer(reduceMotion)}>
              {experience.location && (
                <motion.div
                  {...staggerItem(reduceMotion)}
                  className="rounded-2xl border-[3px] border-brand-primary/20 bg-gradient-to-br from-brand-primary/5 to-transparent p-6 sm:p-8 shadow-md shadow-brand-primary/10 transition-all duration-200 hover:border-brand-primary/35 hover:shadow-lg hover:shadow-brand-primary/15"
                >
                  <div className="flex items-center gap-4 mb-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/15 text-brand-primary">
                      <MapPin className="h-6 w-6" aria-hidden strokeWidth={2} />
                    </span>
                    <h3 className="font-display text-lg font-bold text-brand-dark tracking-tight">{experience.location.title}</h3>
                  </div>
                  <p className="text-brand-muted text-sm sm:text-base leading-relaxed">
                    {experience.location.addressText}
                  </p>
                </motion.div>
              )}
              {(cancellationSummary || experience.cancellationPolicy?.fullText) && (
                <div className="rounded-2xl border-[3px] border-brand-primary/20 bg-gradient-to-br from-brand-primary/5 via-brand-bg/50 to-transparent p-6 sm:p-8 shadow-md shadow-brand-primary/10 transition-all duration-200 hover:border-brand-primary/35 hover:shadow-lg hover:shadow-brand-primary/15">
                  <div className="flex items-center gap-4 mb-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/15 text-brand-primary">
                      <ShieldCheck className="h-6 w-6" aria-hidden strokeWidth={2} />
                    </span>
                    <h3 className="font-display text-lg font-bold text-brand-dark tracking-tight">Cancellation</h3>
                  </div>
                  <p className="text-[#196a87] text-sm sm:text-base leading-relaxed">
                    {cancellationSummary || experience.cancellationPolicy?.fullText?.slice(0, 200)}
                    {(experience.cancellationPolicy?.fullText?.length ?? 0) > 200 ? "…" : ""}
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.section>
      )}

      {/* Gallery – stagger + icons + hover */}
      {gallery.length >= 1 && (
        <motion.section className="py-16 sm:py-20 lg:py-24 bg-sky-50" {...sectionReveal(reduceMotion)}>
          <div className={contentWidth}>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <h2 className="font-display text-2xl font-bold text-brand-dark tracking-tight inline-flex items-center gap-2">
              <Images className="h-7 w-7 text-brand-primary shrink-0" aria-hidden />
              See the day
            </h2>
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              className="inline-flex items-center gap-2 text-brand-primary font-medium text-sm hover:underline underline-offset-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sky-50 rounded"
            >
              View all {gallery.length} photo{gallery.length !== 1 ? "s" : ""}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <motion.div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" {...staggerContainer(reduceMotion)}>
            {gallery.slice(0, 6).map((src, i) => (
              <motion.button
                key={src + i}
                {...staggerItem(reduceMotion)}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sky-50 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
                aria-label="View photo"
              >
                <Image src={getDisplayImageUrl(src)} alt={experience.galleryAltTexts?.[i]?.trim() || ""} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 640px) 50vw, 33vw" loading="lazy" />
              </motion.button>
            ))}
          </motion.div>
          {gallery.length > 6 && (
            <motion.div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mt-3" {...staggerContainer(reduceMotion)}>
              {gallery.slice(6).map((src, i) => (
                <motion.button key={src + i} {...staggerItem(reduceMotion)} type="button" onClick={() => setLightboxIndex(i + 6)} className="group relative aspect-[4/3] overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sky-50 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]" aria-label="View photo">
                  <Image src={getDisplayImageUrl(src)} alt={experience.galleryAltTexts?.[i + 6]?.trim() || ""} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 640px) 50vw, 33vw" loading="lazy" />
                </motion.button>
              ))}
            </motion.div>
          )}
          </div>
        </motion.section>
      )}

      <AnimatePresence>
        {lightboxIndex != null && gallery[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
            onClick={() => setLightboxIndex(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Photo view"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-[90vw] max-w-6xl h-[85vh] max-h-[85vh] rounded overflow-hidden shadow-2xl flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={getDisplayImageUrl(gallery[lightboxIndex])}
                alt={experience.galleryAltTexts?.[lightboxIndex]?.trim() || `Gallery photo ${lightboxIndex + 1}`}
                fill
                className="object-contain"
                sizes="90vw"
                priority
              />
            </motion.div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAQ – improved hierarchy, cards, CTA */}
      {experience.faqs?.length > 0 && (
        <motion.section className="py-16 sm:py-20 lg:py-24 bg-white" {...sectionReveal(reduceMotion)}>
          <div className={contentWidth}>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-2">FAQ</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight mb-8 inline-flex items-center gap-2">
              <HelpCircle className="h-7 w-7 text-brand-primary shrink-0" aria-hidden />
              Common questions
            </h2>
            <div className="rounded-2xl border-2 border-brand-dark/10 bg-white shadow-sm overflow-hidden max-w-2xl">
              <Accordion type="single" collapsible className="w-full">
                {experience.faqs.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border-b border-brand-dark/10 last:border-b-0 px-5 sm:px-6">
                    <AccordionTrigger className="text-left font-semibold text-brand-dark py-5 px-0 hover:no-underline hover:text-brand-primary data-[state=open]:text-brand-primary [&[data-state=open]>svg]:rotate-180 transition-colors">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-brand-muted text-sm sm:text-base leading-relaxed pb-5 pt-0 px-0">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border-2 border-brand-primary/20 bg-white/80 px-5 py-4 max-w-2xl">
              <HelpCircle className="h-5 w-5 text-brand-primary shrink-0" aria-hidden />
              <p className="text-brand-muted text-sm sm:text-base">
                <Link href="/contact" className="font-semibold text-brand-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded">Text or call us</Link>
                {" "}if you have more questions.
              </p>
            </div>
          </div>
        </motion.section>
      )}

      {/* Testimonial – icon + motion */}
      {testimonials.length > 0 && testimonials[0] && (
        <motion.section className={"py-16 sm:py-20 lg:py-24 bg-brand-dark " + contentWidth} {...sectionReveal(reduceMotion)}>
          <Quote className="h-10 w-10 text-brand-primary/50 mb-4" aria-hidden />
          <p className="font-display text-2xl sm:text-3xl font-bold text-white leading-snug tracking-tight max-w-2xl">
            &ldquo;{testimonials[0].quote}&rdquo;
          </p>
          <p className="mt-4 text-white/70 font-medium">— {testimonials[0].name}{testimonials[0].date ? `, ${testimonials[0].date}` : ""}</p>
        </motion.section>
      )}

      {/* Reserve – icon + motion */}
      <motion.section ref={calendarRef} className="py-16 sm:py-20 lg:py-28 bg-brand-dark" {...sectionReveal(reduceMotion)}>
        <div className={contentWidth}>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight inline-flex items-center gap-3">
            <Calendar className="h-9 w-9 text-brand-primary shrink-0" aria-hidden />
            Find your day
          </h2>
          <p className="text-white/80 text-base mt-3 max-w-lg">Choose your date below. Free to hold — cancel or change anytime.</p>
          <div className="mt-8 rounded-2xl bg-white/5 border-2 border-white/15 overflow-hidden">
            <ExperienceCalendarSection
              experienceId={id}
              experienceSlug={experience.slug}
              bookHref={bookHref}
              onOpenInModal={(selection) => openWithSelection({ ...selection, experienceId: id, experienceSlug: experience.slug })}
              experienceForDetails={{
                id,
                title: experience.title,
                maxGuests: getMaxGuestsForExperience(experience),
                petsMax: experience.petsMax ?? 0,
              }}
              ratesForDetails={rates}
              addonsForDetails={addons}
            />
          </div>
          <p className="text-white font-display text-xl font-semibold mt-10 tracking-tight">See you on the water.</p>
        </div>
      </motion.section>
    </div>
  );
}
