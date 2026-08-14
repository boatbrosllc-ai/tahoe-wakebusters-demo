import Link from "next/link";
import { brand } from "@/content/brand";

/**
 * ABC Boats marketing page — exists only as this customer's frontend.
 * Other sites do not use this file.
 */
export function AbcBoatsAboutPage() {
  return (
    <article className="bg-[#f6f1e7] px-6 py-16 sm:px-10 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="font-display text-xs uppercase tracking-[0.35em] text-[#c9a227]">About</p>
        <h1 className="mt-3 font-display text-4xl uppercase tracking-wide text-[#0b1f3a] sm:text-5xl">
          A fake customer with a real folder
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#3d4f66]">
          {brand.companyName} is a placeholder operator used to prove that Slipstack can ship a
          unique website without cloning the booking engine. This page lives in{" "}
          <code className="rounded-sm bg-white px-1.5 py-0.5 text-sm">sites/abc-boats/</code> and
          can be rewritten without touching shared platform code.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-[#3d4f66]">
          Reservations, payments, waivers, and admin still come from the shared Slipstack
          application. Redesign this page anytime — only ABC Boats changes.
        </p>
        <Link
          href="/"
          className="mt-10 inline-block border border-[#0b1f3a] bg-[#0b1f3a] px-6 py-3 font-display text-xs uppercase tracking-[0.2em] text-white"
        >
          Back to home
        </Link>
      </div>
    </article>
  );
}
