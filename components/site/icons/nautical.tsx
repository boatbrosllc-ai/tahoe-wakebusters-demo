import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function NauticalIcon({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Classic marine anchor. */
export function AnchorIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M12 2.25a1.75 1.75 0 0 0-.75 3.33V8.2c-2.86.34-5.1 2.78-5.1 5.76 0 .41.34.75.75.75h1.1a.75.75 0 0 0 .75-.75c0-1.8 1.46-3.26 3.25-3.26V18.4l-2.22-2.22a.75.75 0 1 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L12.75 18.4v-7.7c1.79 0 3.25 1.46 3.25 3.26a.75.75 0 0 0 .75.75h1.1a.75.75 0 0 0 .75-.75c0-2.98-2.24-5.42-5.1-5.76V5.58A1.75 1.75 0 0 0 12 2.25Z" />
    </NauticalIcon>
  );
}

/** Three-masted sailing ship. */
export function TallShipIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M12.2 2.4c.3-.2.7 0 .7.35V12.2h1.4L11.4 3.05a.55.55 0 0 1 .8-.65ZM10.55 5.6 6.4 12.2h4.15V5.6ZM4.2 13.15h15.6c.4 0 .7.45.45.8l-1.5 2.15H5.25L3.75 13.95c-.25-.35.05-.8.45-.8ZM3.35 17.3h17.3l-1.05 1.85a1.1 1.1 0 0 1-.95.6H5.35a1.1 1.1 0 0 1-.95-.6L3.35 17.3Z" />
    </NauticalIcon>
  );
}

/** Ship's wheel / helm. */
export function HelmIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M12 3.1c.4 0 .72.32.72.72v1.38a6.82 6.82 0 0 1 2.52.97l.97-.97a.72.72 0 1 1 1.02 1.02l-.97.97a6.82 6.82 0 0 1 .97 2.52h1.38a.72.72 0 0 1 0 1.44h-1.38a6.82 6.82 0 0 1-.97 2.52l.97.97a.72.72 0 1 1-1.02 1.02l-.97-.97a6.82 6.82 0 0 1-2.52.97v1.38a.72.72 0 0 1-1.44 0v-1.38a6.82 6.82 0 0 1-2.52-.97l-.97.97a.72.72 0 1 1-1.02-1.02l.97-.97a6.82 6.82 0 0 1-.97-2.52H3.82a.72.72 0 0 1 0-1.44h1.38a6.82 6.82 0 0 1 .97-2.52l-.97-.97a.72.72 0 1 1 1.02-1.02l.97.97a6.82 6.82 0 0 1 2.52-.97V3.82c0-.4.32-.72.72-.72Zm0 5.15a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm0 2.1a1.65 1.65 0 1 1 0 3.3 1.65 1.65 0 0 1 0-3.3Z" />
    </NauticalIcon>
  );
}

/** Small sailboat. */
export function SailboatIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M12.7 3.15c.35-.22.8.03.8.45v10.2h1.85L11.9 4.2a.55.55 0 0 1 .8-1.05ZM11.05 6.4 6.6 13.8h4.45V6.4Z" />
      <path d="M3.4 16.35c.2-.5.7-.85 1.25-.85h14.7c.55 0 1.05.35 1.25.85l.7 1.7a1.1 1.1 0 0 1-1.03 1.5H3.73a1.1 1.1 0 0 1-1.03-1.5l.7-1.7Z" />
    </NauticalIcon>
  );
}

/** Speed / fuel gauge. */
export function GaugeIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M12 3.2A9.3 9.3 0 0 0 2.7 12.5c0 1.7.46 3.3 1.27 4.68.3.5.9.72 1.45.55l.7-.22a1.1 1.1 0 0 0 .72-1.4 7.05 7.05 0 1 1 9.32 0c.2.55.75.9 1.32.9.14 0 .27-.02.4-.05l.7.22c.55.17 1.16-.05 1.45-.55A9.27 9.27 0 0 0 21.3 12.5 9.3 9.3 0 0 0 12 3.2Zm.55 3.4v2.35a.75.75 0 0 1-1.5 0V6.6a.75.75 0 0 1 1.5 0Zm4.12 1.7 1.66-1.66a.75.75 0 1 1 1.06 1.06l-1.66 1.66a.75.75 0 0 1-1.06-1.06ZM6.27 6.7a.75.75 0 0 1 1.06 0l1.66 1.66A.75.75 0 1 1 7.93 9.4L6.27 7.76a.75.75 0 0 1 0-1.06Z" />
      <path d="M13.35 13.05a1.55 1.55 0 1 1-2.18-2.18l3.7-3.7a.7.7 0 0 1 1.12.8l-2.64 5.08Z" />
    </NauticalIcon>
  );
}

/** Front-facing ferry / cruise ship on water. */
export function FerryIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M8.2 4.4h7.6c.4 0 .7.3.7.7v1.35H7.5V5.1c0-.4.3-.7.7-.7Z" />
      <path d="M6.4 7.1h11.2v2.55H6.4V7.1Z" />
      <path d="M4.85 10.3h14.3l1.2 2.85H3.65l1.2-2.85Z" />
      <path d="M3.2 14.4h17.6l-.85 1.7c-.2.4-.6.65-1.05.65H5.1c-.45 0-.85-.25-1.05-.65L3.2 14.4Z" />
      <path d="M4.1 18.35c.9-.7 2.05-.7 2.95 0 .9.7 2.05.7 2.95 0 .9-.7 2.05-.7 2.95 0 .9.7 2.05.7 2.95 0 .9-.7 2.05-.7 2.95 0 .28.22.33.62.12.9a.67.67 0 0 1-.51.25H4.5a.67.67 0 0 1-.51-.25.64.64 0 0 1 .12-.9Z" />
      <path d="M9.1 5.55h1.3v.9H9.1v-.9Zm2.25 0h1.3v.9h-1.3v-.9Zm2.25 0h1.3v.9h-1.3v-.9ZM8.2 8h1.35v.85H8.2V8Zm2.2 0h1.35v.85H10.4V8Zm2.2 0H14v.85h-1.4V8Zm2.2 0h1.35v.85H14.8V8Z" />
    </NauticalIcon>
  );
}

/** Bed / overnight capacity. */
export function BedIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M4.2 11.1V6.85c0-.75.6-1.35 1.35-1.35h4.1c.75 0 1.35.6 1.35 1.35V11.1H4.2Zm8.8 0V7.4c0-.6.5-1.1 1.1-1.1h4.35c.6 0 1.1.5 1.1 1.1v3.7H13Z" />
      <path d="M3.15 12.35h17.7c.6 0 1.1.5 1.1 1.1v2.05H2.05V13.45c0-.6.5-1.1 1.1-1.1Z" />
      <path d="M2.05 16.7h1.3v2.45c0 .4.32.72.72.72h.86a.72.72 0 0 0 .72-.72V16.7h12.7v2.45c0 .4.32.72.72.72h.86a.72.72 0 0 0 .72-.72V16.7h1.3v3.55a.9.9 0 0 1-.9.9H2.95a.9.9 0 0 1-.9-.9V16.7Z" />
    </NauticalIcon>
  );
}

/** Length / dimensions ruler. */
export function RulerIcon(props: IconProps) {
  return (
    <NauticalIcon {...props}>
      <path d="M2.4 10.15h19.2c.6 0 1.1.5 1.1 1.1v1.5c0 .6-.5 1.1-1.1 1.1H2.4c-.6 0-1.1-.5-1.1-1.1v-1.5c0-.6.5-1.1 1.1-1.1Zm1.55 0v1.55h.7V10.15h-.7Zm2.05 0v2.45h.7v-2.45h-.7Zm2.05 0v1.55h.7V10.15h-.7Zm2.05 0v2.45h.7v-2.45h-.7Zm2.05 0v1.55h.7V10.15h-.7Zm2.05 0v2.45h.7v-2.45h-.7Zm2.05 0v1.55h.7V10.15h-.7Zm2.05 0v2.45h.7v-2.45h-.7Z" />
    </NauticalIcon>
  );
}

const ICONS = {
  anchor: AnchorIcon,
  tallShip: TallShipIcon,
  helm: HelmIcon,
  sailboat: SailboatIcon,
  gauge: GaugeIcon,
  ferry: FerryIcon,
  bed: BedIcon,
  ruler: RulerIcon,
} as const;

export type NauticalIconName = keyof typeof ICONS;

/** Pick a nautical icon from feature copy. */
export function iconForHighlight(text: string): (typeof ICONS)[NauticalIconName] {
  const t = text.toLowerCase();
  if (/gas|fuel|tank|stereo|bluetooth/.test(t)) return ICONS.gauge;
  if (/captain|helm|certified/.test(t)) return ICONS.helm;
  if (/life jacket|safety|gear/.test(t)) return ICONS.anchor;
  if (/slide|deck|barge|grill|cooler/.test(t)) return ICONS.tallShip;
  if (/toy|tube|float|ski|board|wake|surf/.test(t)) return ICONS.sailboat;
  if (/seat|guest|sleep|overnight|comfortable|capacity/.test(t)) return ICONS.bed;
  if (/length|ft\b|foot|size|dimension/.test(t)) return ICONS.ruler;
  if (/boat|tritoon|pontoon|mastercraft/.test(t)) return ICONS.ferry;
  return ICONS.anchor;
}
