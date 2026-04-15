"use client";

import { useCallback, useMemo, useRef } from "react";
import { getDisplayImageUrl } from "@/lib/utils";
import {
  formatPercentsToObjectPosition,
  parseObjectPositionToPercents,
} from "@/lib/image-position";
import { cn } from "@/lib/utils";

export type ImageFramingToolProps = {
  /** Resolved image URL (hero or card source). */
  imageUrl: string | null | undefined;
  /** Stored CSS `object-position` or "" for site default. */
  value: string;
  onChange: (next: string) => void;
  /** Section title, e.g. "Detail page hero" */
  label: string;
  /** Short hint under the title */
  hint?: string;
};

function PreviewFrame({
  title,
  aspectClass,
  src,
  objectPosition,
  isDefault,
}: {
  title: string;
  aspectClass: string;
  src: string;
  objectPosition: string | undefined;
  isDefault: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">{title}</p>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg bg-brand-dark/15 ring-1 ring-brand-dark/10 shadow-inner",
          aspectClass
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview; avoids Next config domains */}
        <img
          src={src}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-[object-position] duration-75",
            isDefault && !objectPosition && "object-center"
          )}
          style={objectPosition ? { objectPosition } : undefined}
          draggable={false}
        />
      </div>
    </div>
  );
}

export function ImageFramingTool({ imageUrl, value, onChange, label, hint }: ImageFramingToolProps) {
  const dragging = useRef(false);
  const trimmed = value.trim();
  const isDefault = !trimmed;
  const { x, y } = useMemo(() => parseObjectPositionToPercents(value), [value]);
  const displaySrc = imageUrl?.trim() ? getDisplayImageUrl(imageUrl.trim()) : "";

  const applyFocal = useCallback(
    (clientX: number, clientY: number, el: HTMLImageElement) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const px = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
      const py = Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100));
      onChange(formatPercentsToObjectPosition(px, py));
    },
    [onChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      e.preventDefault();
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyFocal(e.clientX, e.clientY, e.currentTarget);
    },
    [applyFocal]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (!dragging.current) return;
      applyFocal(e.clientX, e.clientY, e.currentTarget);
    },
    [applyFocal]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const posForPreview = isDefault ? undefined : trimmed;

  return (
    <div className="rounded-xl border border-brand-dark/10 bg-white p-4 space-y-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-brand-dark">{label}</p>
        {hint ? <p className="text-sm text-brand-muted mt-1">{hint}</p> : null}
      </div>

      {!displaySrc ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Add an image above to preview framing. For video heroes, the first gallery image is used on cards.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PreviewFrame
              title="Listing card (4:3)"
              aspectClass="aspect-[4/3] max-w-[280px]"
              src={displaySrc}
              objectPosition={posForPreview}
              isDefault={isDefault}
            />
            <PreviewFrame
              title="Hero band (5:2 desktop)"
              aspectClass="aspect-[5/2] max-w-[320px]"
              src={displaySrc}
              objectPosition={posForPreview}
              isDefault={isDefault}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-brand-dark">Set focal point</p>
            <p className="text-xs text-brand-muted">
              Click or drag on the photo. Previews above update live — they use the same crop as the site{" "}
              <span className="whitespace-nowrap">(<code className="text-[11px]">object-fit: cover</code>).</span>
            </p>
            <div className="rounded-lg border border-brand-dark/15 bg-brand-bg/40 p-2 max-w-xl">
              <div className="relative inline-block max-w-full align-top">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displaySrc}
                  alt=""
                  className="block max-h-56 w-auto max-w-full object-contain cursor-crosshair touch-none select-none bg-brand-dark/5"
                  draggable={false}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  aria-hidden
                >
                  <div
                    className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md bg-brand-primary"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-brand-dark mb-1">
                <span>Horizontal</span>
                <span className="tabular-nums text-brand-muted">{Math.round(x)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(x)}
                className="w-full h-2 accent-brand-primary"
                onChange={(e) => onChange(formatPercentsToObjectPosition(Number(e.target.value), y))}
                aria-label={`${label} horizontal focal`}
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-brand-dark mb-1">
                <span>Vertical</span>
                <span className="tabular-nums text-brand-muted">{Math.round(y)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(y)}
                className="w-full h-2 accent-brand-primary"
                onChange={(e) => onChange(formatPercentsToObjectPosition(x, Number(e.target.value)))}
                aria-label={`${label} vertical focal`}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-xs font-medium rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-brand-dark hover:bg-brand-bg transition-colors"
              onClick={() => onChange("")}
            >
              Use site default
            </button>
            <button
              type="button"
              className="text-xs font-medium rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-brand-dark hover:bg-brand-bg transition-colors"
              onClick={() => onChange(formatPercentsToObjectPosition(50, 50))}
            >
              Center (50% 50%)
            </button>
            <button
              type="button"
              className="text-xs font-medium rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-brand-dark hover:bg-brand-bg transition-colors"
              onClick={() => onChange(formatPercentsToObjectPosition(50, 35))}
            >
              Upper third
            </button>
            <button
              type="button"
              className="text-xs font-medium rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-brand-dark hover:bg-brand-bg transition-colors"
              onClick={() => onChange(formatPercentsToObjectPosition(50, 70))}
            >
              Lower third
            </button>
          </div>

          <p className="text-xs text-brand-muted">
            Saved value:{" "}
            <code className="text-[11px] bg-brand-dark/5 px-1.5 py-0.5 rounded">
              {isDefault ? "(none — automatic framing)" : trimmed}
            </code>
          </p>
        </>
      )}
    </div>
  );
}
