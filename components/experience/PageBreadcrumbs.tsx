"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  name: string;
  href: string;
}

/** Visual breadcrumb nav. JSON-LD is emitted by the parent page's schema component. */
export function PageBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="px-5 sm:px-6 lg:px-8 py-3 bg-brand-dark/95 border-b border-white/10">
      <ol className="max-w-7xl mx-auto flex flex-wrap items-center gap-1 text-sm text-white/70">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />}
              {isLast ? (
                <span className="text-white/90 font-medium" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <Link href={item.href} className="hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
