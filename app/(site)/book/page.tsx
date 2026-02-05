import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { experiences } from "@/content/experiences";
import { BookingEmbed } from "@/components/site/BookingEmbed";
import { TrustLine } from "@/components/site/TrustLine";
import { siteConfig } from "@/config/site";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Check Availability | Book a Boat",
  description: `Book your Lake Travis or Lake Austin boat rental. Choose your experience and date. ${brand.companyName}, Austin TX.`,
};

type SearchParams = { experience?: string };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const experienceSlug = typeof params.experience === "string" ? params.experience : null;
  const experience = experienceSlug
    ? experiences.find((e) => e.slug === experienceSlug)
    : null;

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mb-2">
          Check availability
        </h1>
        <p className="text-lg text-brand-muted mb-6">
          {experience
            ? `You're booking: ${experience.title}. Pick a date and time below.`
            : "Choose your experience and date. You'll see open slots and can book in a few clicks."}
        </p>

        {!experience && (
          <div className="mb-8">
            <p className="text-sm font-medium text-brand-dark mb-3">Choose an experience:</p>
            <ul className="flex flex-wrap gap-2">
              {experiences.map((e) => (
                <li key={e.slug}>
                  <Link
                    href={`/book?experience=${encodeURIComponent(e.slug)}`}
                    className="inline-block rounded-xl bg-white border border-brand-dark/15 px-4 py-2 text-sm font-medium text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                  >
                    {e.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {siteConfig.booking.mode === "embed" ? (
          <BookingEmbed className="mt-6" />
        ) : (
          <div className="mt-6 space-y-6">
            <div>
              <BookingEmbed />
              <TrustLine variant="default" className="mt-4 justify-center" />
            </div>

            <section className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden" aria-labelledby="what-to-expect-heading">
              <h2 id="what-to-expect-heading" className="sr-only">
                What to expect
              </h2>
              <Accordion type="single" collapsible className="w-full" defaultValue="what-to-expect-0">
                <AccordionItem value="what-to-expect-0">
                  <AccordionTrigger className="py-4 px-6 text-left font-semibold text-brand-dark hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-brand-dark/10">
                    Pick your date & time
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    Choose from available slots. Same-day and next-day options often available.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="what-to-expect-1">
                  <AccordionTrigger className="py-4 px-6 text-left font-semibold text-brand-dark hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-brand-dark/10">
                    Instant confirmation
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    You&apos;ll get a confirmation right away with details and next steps.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="what-to-expect-2">
                  <AccordionTrigger className="py-4 px-6 text-left font-semibold text-brand-dark hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-brand-dark/10">
                    Easy reschedule
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    Need to change plans? Reschedule or cancel per our policy—no hassle.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="what-to-expect-3">
                  <AccordionTrigger className="py-4 px-6 text-left font-semibold text-brand-dark hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-brand-dark/10">
                    Day-of support
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    Our crew will meet you at the dock. Life vests and safety briefing included.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="what-to-expect-4">
                  <AccordionTrigger className="py-4 px-6 text-left font-semibold text-brand-dark hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-brand-dark/10">
                    Questions before booking?
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    Call or text us—we&apos;re happy to help with experience picks, capacity, or captain options.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
