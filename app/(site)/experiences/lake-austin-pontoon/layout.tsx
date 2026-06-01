import type { Metadata } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/experiences/lake-austin-pontoon`;

export const metadata: Metadata = {
  title: "Lake Austin Pontoon Rentals | Captain Included",
  description:
    "Pontoon rentals Lake Austin. Captain included, premium sound, lily pad, cooler (ice included). Chill, swim, celebrate. Book your Lake Austin pontoon rental.",
  keywords: ["Lake Austin pontoon rentals", "pontoon rental Lake Austin", "Lake Austin pontoon party"],
  alternates: { canonical },
  openGraph: {
    title: "Lake Austin Pontoon Rentals | Boat Bros",
    description:
      "Pontoon rentals Lake Austin. Captain included, premium sound, lily pad. Book your day.",
    url: canonical,
  },
};

export default function LakeAustinPontoonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
