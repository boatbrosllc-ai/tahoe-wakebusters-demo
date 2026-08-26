import { cn } from "@/lib/utils";

export function MarketplaceEmailDetails({
  details,
  excerpt,
  className,
}: {
  details?: Record<string, string> | null;
  excerpt?: string | null;
  className?: string;
}) {
  const entries = details ? Object.entries(details).filter(([, v]) => v?.trim()) : [];
  if (entries.length === 0 && !excerpt?.trim()) return null;
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted">From marketplace email</h3>
      {entries.length > 0 && (
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          {entries.map(([label, value]) => (
            <div key={label}>
              <dt className="text-brand-muted text-xs">{label}</dt>
              <dd className="text-brand-dark mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {excerpt?.trim() && (
        <pre className="whitespace-pre-wrap text-xs text-brand-dark rounded-lg bg-brand-bg/50 px-3 py-2 max-h-64 overflow-auto">
          {excerpt.trim()}
        </pre>
      )}
    </section>
  );
}
