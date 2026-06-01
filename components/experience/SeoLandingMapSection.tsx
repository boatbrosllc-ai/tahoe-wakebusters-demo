import Link from "next/link";
import { location } from "@/content/location";
import { MapEmbed } from "@/components/site/MapEmbed";

export function SeoLandingMapSection() {
  return (
    <section className="bg-white py-12 sm:py-16" aria-labelledby="seo-map-heading">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <h2 id="seo-map-heading" className="font-display text-2xl sm:text-3xl font-bold text-brand-dark text-center mb-3">
          On Lake Austin — minutes from downtown
        </h2>
        <p className="text-center text-brand-dark/70 max-w-2xl mx-auto mb-8">
          Boat Bros charters launch on Lake Austin. Easy access from Austin, TX — see{" "}
          <Link href="/location" className="text-brand-primary font-medium hover:underline">
            directions & parking
          </Link>
          .
        </p>
        <MapEmbed src={location.mapEmbedSrc} viewOnMapsUrl={location.googleMapsPlaceUrl} title="Lake Austin boat rental location — Boat Bros ATX" />
      </div>
    </section>
  );
}
