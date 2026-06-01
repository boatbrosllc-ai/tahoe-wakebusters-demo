"use client";

export interface ComparisonRow {
  label: string;
  left: string;
  right: string;
}

export function ComparisonSection({
  rows,
  leftHeading,
  rightHeading,
  headline = "Compare your options",
}: {
  rows: ComparisonRow[];
  leftHeading: string;
  rightHeading: string;
  headline?: string;
}) {
  if (!rows.length) return null;
  return (
    <section className="px-5 sm:px-6 lg:px-8 py-12 sm:py-16 bg-brand-dark/80" aria-labelledby="comparison-heading">
      <div className="max-w-4xl mx-auto">
        <h2 id="comparison-heading" className="text-2xl sm:text-3xl font-bold text-white text-center mb-8">
          {headline}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm sm:text-base">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="p-4 text-white/60 font-medium" scope="col" />
                <th className="p-4 text-white font-semibold" scope="col">
                  {leftHeading}
                </th>
                <th className="p-4 text-white font-semibold" scope="col">
                  {rightHeading}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-white/10 last:border-0">
                  <th className="p-4 text-white/80 font-medium" scope="row">
                    {row.label}
                  </th>
                  <td className="p-4 text-white/75">{row.left}</td>
                  <td className="p-4 text-white/75">{row.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
