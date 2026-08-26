"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

interface LayeredTextProps {
  lines?: Array<{ top: string; bottom: string }>;
  fontSize?: string;
  fontSizeMd?: string;
  lineHeight?: number;
  lineHeightMd?: number;
  className?: string;
  /** Resting text color (CSS color). */
  color?: string;
  /** Hover / active text color — defaults to brand orange. */
  activeColor?: string;
}

export function LayeredText({
  lines = [
    { top: "\u00A0", bottom: "INFINITE" },
    { top: "INFINITE", bottom: "PROGRESS" },
    { top: "PROGRESS", bottom: "INNOVATION" },
    { top: "INNOVATION", bottom: "FUTURE" },
    { top: "FUTURE", bottom: "DREAMS" },
    { top: "DREAMS", bottom: "ACHIEVEMENT" },
    { top: "ACHIEVEMENT", bottom: "\u00A0" },
  ],
  fontSize = "72px",
  fontSizeMd = "36px",
  lineHeight = 60,
  lineHeightMd = 35,
  className = "",
  color,
  activeColor = "#ff6b2b",
}: LayeredTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const isOpenRef = useRef(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const activeLineHeight = isDesktop ? lineHeight : lineHeightMd;
  const activeFontSize = isDesktop ? fontSize : fontSizeMd;
  const baseOffset = isDesktop ? 35 : 20;
  const centerIndex = Math.floor(lines.length / 2);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const paragraphs = container.querySelectorAll("p");

    timelineRef.current?.kill();
    timelineRef.current = gsap.timeline({ paused: true });
    gsap.set(paragraphs, { y: 0, color: color || "currentColor" });
    timelineRef.current.to(paragraphs, {
      y: -activeLineHeight,
      color: activeColor,
      duration: 0.8,
      ease: "power2.out",
      stagger: 0.08,
    });
    if (isOpenRef.current) timelineRef.current.progress(1);

    const handleMouseEnter = () => {
      isOpenRef.current = true;
      setIsActive(true);
      timelineRef.current?.play();
    };
    const handleMouseLeave = () => {
      isOpenRef.current = false;
      setIsActive(false);
      timelineRef.current?.reverse();
    };
    const handleClick = () => {
      isOpenRef.current = !isOpenRef.current;
      setIsActive(isOpenRef.current);
      if (isOpenRef.current) timelineRef.current?.play();
      else timelineRef.current?.reverse();
    };

    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (canHover) {
      container.addEventListener("mouseenter", handleMouseEnter);
      container.addEventListener("mouseleave", handleMouseLeave);
    } else {
      container.addEventListener("click", handleClick);
    }

    return () => {
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("click", handleClick);
      timelineRef.current?.kill();
    };
  }, [lines, activeLineHeight, isDesktop, color, activeColor]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "mx-auto cursor-pointer py-16 font-black uppercase tracking-[-2px] text-brand-dark antialiased transition-colors duration-300 sm:py-20 md:py-24",
        className
      )}
      style={{
        fontSize: activeFontSize,
        color: isActive ? activeColor : color,
      }}
      role="presentation"
    >
      <ul className="m-0 flex list-none flex-col items-center p-0">
        {lines.map((line, index) => {
          const even = index % 2 === 0;
          const translateX = (index - centerIndex) * baseOffset;
          const skew = even ? "60deg, -30deg" : "0deg, -30deg";
          const scaleY = even ? "0.66667" : "1.33333";
          return (
            <li
              key={`${line.top}-${line.bottom}-${index}`}
              className="relative overflow-hidden"
              style={{
                height: `${activeLineHeight}px`,
                transform: `translateX(${translateX}px) skew(${skew}) scaleY(${scaleY})`,
              }}
            >
              <p
                className="m-0 whitespace-nowrap px-[10px] align-top sm:px-[15px]"
                style={{
                  height: `${activeLineHeight}px`,
                  lineHeight: `${activeLineHeight - 5}px`,
                }}
              >
                {line.top}
              </p>
              <p
                className="m-0 whitespace-nowrap px-[10px] align-top sm:px-[15px]"
                style={{
                  height: `${activeLineHeight}px`,
                  lineHeight: `${activeLineHeight - 5}px`,
                }}
              >
                {line.bottom}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
