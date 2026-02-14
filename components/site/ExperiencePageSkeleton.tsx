/**
 * Staged skeleton for experience detail pages.
 * Hero appears first, then content blocks reveal in sequence (CSS animation-delay)
 * so the loading state feels smooth and intentional.
 */
export function ExperiencePageSkeleton() {
  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Stage 1: Hero skeleton */}
      <div className="relative w-full min-h-[60vh] sm:min-h-[75vh] bg-brand-dark/80 animate-pulse opacity-0 animate-skeleton-reveal skeleton-reveal-stage-0">
        <div className="absolute inset-0 flex flex-col justify-end pb-16 px-5 sm:px-8 lg:px-12 max-w-4xl">
          <div className="h-8 w-48 bg-white/20 rounded-lg mb-4" />
          <div className="h-12 sm:h-14 w-full max-w-xl bg-white/15 rounded-lg mb-3" />
          <div className="h-6 w-3/4 max-w-md bg-white/10 rounded" />
        </div>
      </div>

      {/* Stage 2 & 3: Content blocks — bar then grid */}
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="h-24 w-full max-w-md rounded-2xl bg-white/5 opacity-0 animate-skeleton-reveal skeleton-reveal-stage-1" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 opacity-0 animate-skeleton-reveal skeleton-reveal-stage-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
