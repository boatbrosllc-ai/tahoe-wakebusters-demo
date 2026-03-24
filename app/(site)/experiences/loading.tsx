/**
 * Matches `ExperiencesListClient` layout: hero band + heading placeholders + card grid.
 */
export default function ExperiencesLoading() {
  return (
    <div className="min-h-screen bg-white">
      <section
        className="h-[45vh] min-h-[320px] max-h-[480px] bg-brand-dark/85 animate-pulse"
        aria-hidden
      />
      <section className="section-padding bg-white">
        <div className="container-wide px-4 sm:px-6 lg:px-8 animate-pulse">
          <div className="h-10 sm:h-12 w-72 max-w-full bg-brand-dark/10 rounded-xl mx-auto mb-4" />
          <div className="h-5 w-96 max-w-full bg-brand-dark/5 rounded-lg mx-auto mb-10" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 rounded-2xl bg-brand-dark/5" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
