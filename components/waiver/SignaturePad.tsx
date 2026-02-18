"use client";

import React, { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  onDataUrlChange?: (dataUrl: string | null) => void;
  typedName?: string;
  onTypedNameChange?: (value: string) => void;
  requireTypedName?: boolean;
  className?: string;
}

export function SignaturePad({
  onDataUrlChange,
  typedName = "",
  onTypedNameChange,
  requireTypedName = false,
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
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) {
        const t = e.touches[0];
        return {
          x: (t.clientX - rect.left) * scaleX,
          y: (t.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
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
      <div className="border-2 border-brand-dark/20 rounded-xl overflow-hidden bg-white touch-none">
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
        />
      </div>
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
            className="w-full rounded-xl border border-brand-dark/20 px-4 py-3 text-base text-brand-dark placeholder:text-brand-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 min-h-[48px] touch-manipulation"
            placeholder="Type your full name"
          />
        </div>
      )}
    </div>
  );
}
