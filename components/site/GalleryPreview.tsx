import { GalleryPreviewClient } from "@/components/site/GalleryPreviewClient";

/** Home gallery: grid is server-rendered shell; interactivity + lightbox live in `GalleryPreviewClient`. */
export function GalleryPreview() {
  return (
    <section className="section-padding bg-brand-bg" aria-labelledby="gallery-heading">
      <div className="container-wide">
        <h2 id="gallery-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-4">
          On the water
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          Lake Austin views, boats, and good times.
        </p>
        <GalleryPreviewClient />
      </div>
    </section>
  );
}
