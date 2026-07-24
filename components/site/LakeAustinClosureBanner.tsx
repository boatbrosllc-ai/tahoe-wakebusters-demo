import Link from "next/link";

const OFFICIAL_NOTICE_URL =
  "https://www.austintexas.gov/emergency-management/news/city-extends-waterways-ban-until-saturday";

/** Temporary home-page alert — remove or update when Lake Austin reopens. */
export function LakeAustinClosureBanner() {
  return (
    <div
      className="bg-amber-400 border-b border-amber-500/80 text-amber-950"
      role="status"
      aria-live="polite"
    >
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-3.5">
        <p className="text-sm sm:text-[15px] leading-snug text-center font-medium">
          <span className="font-bold uppercase tracking-wide">Lake Austin temporarily closed:</span>{" "}
          The City of Austin has suspended recreational activities on Lake Austin through Saturday, July 25
          (5 p.m.). We&apos;re currently offering rentals on Lake Travis where available.{" "}
          <Link
            href={OFFICIAL_NOTICE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2 decoration-amber-800/60 hover:decoration-amber-950"
          >
            See the official notice
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
