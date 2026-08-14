const STATS = [
  { value: "4hr", label: "half days" },
  { value: "8hr", label: "full days" },
  { value: "you", label: "the only guests" },
];

export function AbcBoatsStatsBar() {
  return (
    <section className="abc-home-stats bg-[#e7f4f0] px-6 py-10 sm:px-10" aria-label="Trip lengths">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        {STATS.map((stat) => (
          <div key={stat.label} className="border-l-4 border-[#e85d4c] pl-4">
            <p className="font-display text-5xl leading-none text-[#16332f] sm:text-6xl">{stat.value}</p>
            <p className="mt-2 text-sm uppercase tracking-[0.18em] text-[#2a9d8f]">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
