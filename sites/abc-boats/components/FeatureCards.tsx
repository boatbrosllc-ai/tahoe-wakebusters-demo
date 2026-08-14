const TAGS = [
  { title: "just you", body: "Private boat. Your people. Nobody else on the manifest." },
  { title: "captain included", body: "We drive. You swim, snack, and pick the playlist." },
  { title: "book in a minute", body: "Live calendar, same Slipstack checkout — wrapped in this site." },
];

export function AbcBoatsFeatureCards() {
  return (
    <section className="abc-home-tags bg-[#16332f] px-6 py-16 sm:px-10" aria-labelledby="abc-tags-heading">
      <div className="mx-auto max-w-5xl">
        <h2 id="abc-tags-heading" className="font-display text-3xl text-[#fffaf4] sm:text-4xl">
          the whole point is easy.
        </h2>
        <div className="mt-10 flex flex-col gap-4">
          {TAGS.map((tag) => (
            <article
              key={tag.title}
              className="abc-pill rounded-full border border-white/15 bg-[#1f433e] px-6 py-5 sm:px-8 sm:py-6"
            >
              <h3 className="font-display text-xl text-[#f4c9a3] sm:text-2xl">{tag.title}</h3>
              <p className="mt-1 text-sm text-white/75 sm:text-base">{tag.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
