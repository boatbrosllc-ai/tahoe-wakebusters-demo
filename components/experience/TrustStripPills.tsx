"use client";

/** Simple trust pills for SEO landing pages (e.g. Captain included · Lake Austin). */
export function TrustStripPills({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="px-5 sm:px-6 lg:px-8 py-6 bg-brand-dark border-y border-white/10" aria-label="Trust highlights">
      <ul className="max-w-7xl mx-auto flex flex-wrap justify-center gap-2 sm:gap-3">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
