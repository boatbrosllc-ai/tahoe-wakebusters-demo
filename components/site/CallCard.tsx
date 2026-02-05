"use client";

import { Phone, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { analytics } from "@/lib/analytics";

export function CallCard({
  phone,
  phoneTel,
}: {
  phone: string;
  phoneTel: string;
}) {
  return (
    <a
      href={`tel:${phoneTel}`}
      onClick={() => analytics.callClick("more_page", "global")}
      className="block"
    >
      <Card className="transition-shadow hover:shadow-soft-lg border-brand-primary/30 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 p-4 sm:p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/20 text-brand-primary">
              <Phone className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-brand-dark block">
                Call us
              </span>
              <span className="text-sm text-brand-muted block">{phone}</span>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-brand-muted"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
