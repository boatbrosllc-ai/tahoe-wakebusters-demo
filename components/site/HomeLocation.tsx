"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { location } from "@/content/location";
import { MapEmbed } from "@/components/site/MapEmbed";
import { getMarinaMeetNote, getPublicPhone } from "@/lib/seo/public-contact";

/**
 * Homepage section: marina meet-up — area note, optional map, links to location page.
 */
export function HomeLocation() {
  const phone = getPublicPhone();
  const marinaNote = location.marinaMeetNote || getMarinaMeetNote();
  const hasMap = Boolean(location.mapEmbedSrc?.trim());
  const hasDirections = Boolean(location.googleMapsPlaceUrl?.trim());

  return (
    <section
      className="section-padding bg-white overflow-x-hidden"
      aria-labelledby="home-location-heading"
    >
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h2
          id="home-location-heading"
          className="text-2xl sm:text-3xl font-bold text-brand-dark text-center mb-2"
        >
          Marina meet-up in Cabo San Lucas
        </h2>
        <p className="text-brand-muted text-center max-w-xl mx-auto mb-6 sm:mb-8">
          {marinaNote}
        </p>

        <div className={`max-w-3xl mx-auto grid gap-6 ${hasMap ? "sm:grid-cols-[1fr_1fr] sm:gap-8" : ""} items-start`}>
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <MapPin className="h-6 w-6 shrink-0 text-brand-primary mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-brand-dark">{location.name}</p>
                <p className="text-brand-dark mt-1 break-words">{location.addressFormatted}</p>
                <p className="text-brand-muted text-sm mt-2">{marinaNote}</p>
                {phone ? (
                  <a
                    href={`tel:${phone.tel}`}
                    className="mt-2 inline-flex items-center min-h-[44px] py-2 text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                    aria-label={`Call ${phone.display}`}
                  >
                    {phone.display}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
              {hasDirections ? (
                <a
                  href={location.googleMapsPlaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                >
                  Get directions
                </a>
              ) : null}
              <Link
                href="/location"
                className="inline-flex items-center justify-center min-h-[48px] rounded-xl border-2 border-brand-dark/20 px-5 py-3 text-sm font-semibold text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                View location & hours
              </Link>
            </div>
            <p className="mt-4 text-sm text-brand-muted">
              {location.hoursNote}
            </p>
          </div>
          {hasMap ? (
            <div className="min-w-0 rounded-2xl overflow-hidden border border-brand-dark/10 shadow-soft">
              <MapEmbed src={location.mapEmbedSrc} title="Marina Cabo San Lucas area map" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
