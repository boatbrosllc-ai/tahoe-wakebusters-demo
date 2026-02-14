"use client";

import { useEffect, useState } from "react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const article = document.querySelector("article");
      if (!article) return;
      const { top, height } = article.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      if (top > viewportHeight) {
        setProgress(0);
        return;
      }
      const visible = Math.min(viewportHeight - top, height);
      setProgress(Math.round((visible / height) * 100));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="fixed left-0 top-0 z-50 w-full h-1 bg-brand-primary/15"
      role="progressbar"
      aria-valuenow={String(progress)}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Reading progress"
    >
      <div
        className="h-full bg-brand-primary transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
