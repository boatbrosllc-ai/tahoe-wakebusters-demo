"use client";

import { cn } from "@/lib/utils";
import { GridPattern } from "@/components/ui/grid-pattern";

/** Deterministic squares — avoids SSR/client hydration mismatch from Math.random(). */
const DEFAULT_SQUARES: [number, number][] = [
  [7, 1],
  [8, 3],
  [9, 2],
  [10, 5],
  [8, 4],
];

export function GridCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group relative isolate z-0 flex h-full flex-col justify-between overflow-hidden rounded-sm border border-brand-dark/10 bg-white px-5 py-4 transition-colors duration-75",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0">
        <div className="absolute -inset-[25%] -skew-y-12 [mask-image:linear-gradient(225deg,black,transparent)]">
          <GridPattern
            width={30}
            height={30}
            x={0}
            y={0}
            squares={DEFAULT_SQUARES}
            className="fill-brand-dark/10 stroke-brand-dark/10 absolute inset-0 size-full translate-y-2 transition-transform duration-150 ease-out group-hover:translate-y-0"
          />
        </div>
        <div
          className={cn(
            "absolute -inset-[10%] opacity-0 blur-[50px] transition-opacity duration-150 group-hover:opacity-20",
            "bg-[conic-gradient(#00b4d8_0deg,#00b4d8_117deg,#ff6b2b_180deg,#0096b7_240deg,#00b4d8_360deg)]"
          )}
        />
      </div>
      {children}
    </div>
  );
}
