"use client";

import React, { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  onDataUrlChange?: (dataUrl: string | null) => void;
  typedName?: string;
  onTypedNameChange?: (value: string) => void;
  requireTypedName?: boolean;
  /** Shown below the signature canvas when signature is required but missing */
  signatureError?: string | null;
  /** Shown below the typed name input when required but empty */
  typedNameError?: string | null;
  className?: string;
}

export function SignaturePad({
  onDataUrlChange,
  typedName = "",
  onTypedNameChange,
  requireTypedName = false,
  signatureError,
  typedNameError,
  className,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // Use display (CSS) coordinates; canvas context is already scaled by dpr in useEffect
      if ("touches" in e) {
        const t = e.touches[0];
        return { x: t.clientX - rect.left, y: t.clientY - rect.top };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const start = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
      setHasDrawn(true);
    },
    [getCoords]
  );

  const move = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getCoords]
  );

  const end = useCallback(() => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      onDataUrlChange?.(dataUrl);
    } catch {
      onDataUrlChange?.(null);
    }
  }, [onDataUrlChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onDataUrlChange?.(null);
  }, [onDataUrlChange]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-sm text-brand-muted">
        Use your finger or mouse to sign in the box below.
      </p>
      <div className={cn("border-2 rounded-xl overflow-hidden bg-white touch-none", signatureError ? "border-red-500" : "border-brand-dark/20")}>
        <canvas
          ref={canvasRef}
          className="w-full block touch-none"
          style={{ width: "100%", height: "clamp(10rem, 40vw, 12rem)", minHeight: "160px" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          aria-label="Sign here with your finger or mouse"
          aria-invalid={signatureError ? "true" : undefined}
        />
      </div>
      {signatureError && (
        <p className="text-sm text-red-600 font-medium" role="alert">{signatureError}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clear}
          className="min-h-[44px] px-3 text-sm text-brand-muted hover:text-brand-dark underline touch-manipulation"
        >
          Clear
        </button>
      </div>
      {onTypedNameChange && (
        <div>
          <label className="block text-sm font-medium text-brand-dark mb-1.5">
            Printed name {requireTypedName && <span className="text-red-600">*</span>}
          </label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => onTypedNameChange(e.target.value)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-base text-brand-dark placeholder:text-brand-muted focus:outline-none focus:ring-2 min-h-[48px] touch-manipulation",
              typedNameError ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-brand-dark/20 focus:border-brand-primary focus:ring-brand-primary/20"
            )}
            placeholder="Type your full name"
            aria-invalid={typedNameError ? "true" : undefined}
            aria-describedby={typedNameError ? "typed-name-error" : undefined}
          />
          {typedNameError && (
            <p id="typed-name-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">{typedNameError}</p>
          )}
        </div>
      )}
    </div>
  );
}
