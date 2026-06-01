import Link from "next/link";

/** Pillar-page pricing snapshot (captures “how much” queries in visible HTML). */
export function SeoPricingOverview({
  rows,
}: {
  rows: { experience: string; href: string; fromLabel: string; note: string }[];
}) {
  return (
    <section className="bg-white py-12 sm:py-16 border-y border-brand-dark/10" aria-labelledby="seo-pricing-overview-heading">
      <div className="max-w-4xl mx-auto px-5 sm:px-6 lg:px-8">
        <h2 id="seo-pricing-overview-heading" className="font-display text-2xl sm:text-3xl font-bold text-brand-dark mb-2">
          How much does a boat rental in Austin cost?
        </h2>
        <p className="text-brand-dark/70 mb-8">
          Every charter includes a licensed captain. Prices vary by experience and duration — check live availability for your date.
        </p>
        <div className="overflow-x-auto rounded-xl border border-brand-dark/10">
          <table className="w-full text-left text-sm sm:text-base">
            <thead>
              <tr className="bg-brand-bg border-b border-brand-dark/10">
                <th className="p-4 font-semibold text-brand-dark" scope="col">
                  Experience
                </th>
                <th className="p-4 font-semibold text-brand-dark" scope="col">
                  Starting at
                </th>
                <th className="p-4 font-semibold text-brand-dark" scope="col">
                  Best for
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.href} className="border-b border-brand-dark/10 last:border-0">
                  <td className="p-4">
                    <Link href={row.href} className="text-brand-primary font-medium hover:underline">
                      {row.experience}
                    </Link>
                  </td>
                  <td className="p-4 text-brand-dark font-medium">{row.fromLabel}</td>
                  <td className="p-4 text-brand-dark/75">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
