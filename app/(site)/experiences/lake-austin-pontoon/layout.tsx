import type { Metadata } from "next";
import { brand } from "@/content/brand";

export const metadata: Metadata = {
  title: "Lake Austin Pontoon Rentals | Captain Included",
  description:
    "Pontoon rentals Lake Austin. Captain included, premium sound, lily pad, cooler & ice. Chill, swim, celebrate. Book your Lake Austin pontoon rental.",
  keywords: ["Lake Austin pontoon rentals", "pontoon rental Lake Austin", "Lake Austin pontoon party"],
  openGraph: {
    title: "Lake Austin Pontoon Rentals | Boat Bros",
    description:
      "Pontoon rentals Lake Austin. Captain included, premium sound, lily pad. Book your day.",
  },
};

export default function LakeAustinPontoonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
