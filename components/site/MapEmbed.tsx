"use client";

import { useState } from "react";

/**
 * Google Maps iframe embed. No API key. Lazy-loaded and responsive.
 * Replace src with your embed URL from Google Maps (Share → Embed a map).
 */
export function MapEmbed({
  src,
  title = "Nasty Sport Fishing location on Google Maps",
  viewOnMapsUrl,
}: {
  src: string;
  title?: string;
  viewOnMapsUrl?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="w-full min-w-0">
      <div className="relative w-full overflow-hidden rounded-2xl bg-brand-dark/10 shadow-soft aspect-[4/3] sm:aspect-[16/9] min-h-[240px]">
        <iframe
          src={src}
          title={title}
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-brand-bg text-brand-muted text-sm"
            aria-hidden
          >
            Loading map…
          </div>
        )}
      </div>
      {viewOnMapsUrl && (
        <a
          href={viewOnMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center min-h-[44px] text-sm font-medium text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
        >
          View on Google Maps
        </a>
      )}
    </div>
  );
}
