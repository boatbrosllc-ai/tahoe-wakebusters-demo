import type { Metadata } from "next";
import { brand } from "@/content/brand";

export const metadata: Metadata = {
  title: "Lake Austin Luxury Pontoon | Captain Included | Boat Bros",
  description:
    "Premium pontoon charter on Lake Austin. Captain included, premium sound, lily pad, cooler & ice. Chill, swim, celebrate. Book your day.",
  openGraph: {
    title: "Lake Austin Luxury Pontoon | Boat Bros",
    description:
      "Premium pontoon charter on Lake Austin. Captain included, premium sound, lily pad. Book your day.",
  },
};

export default function LakeAustinPontoonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
