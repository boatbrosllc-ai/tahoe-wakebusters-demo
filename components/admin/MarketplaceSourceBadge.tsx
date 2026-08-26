import { cn } from "@/lib/utils";
import {
  resolveMarketplaceSource,
  type MarketplaceSourceFields,
  type MarketplaceSourceStyle,
} from "@/lib/admin/marketplace-source";

export function MarketplaceSourceBadge({
  booking,
  source,
  className,
}: {
  booking?: MarketplaceSourceFields;
  source?: MarketplaceSourceStyle | null;
  className?: string;
}) {
  const resolved = source ?? (booking ? resolveMarketplaceSource(booking) : null);
  if (!resolved) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm leading-none",
        resolved.pillClass,
        className
      )}
    >
      {resolved.label}
    </span>
  );
}
