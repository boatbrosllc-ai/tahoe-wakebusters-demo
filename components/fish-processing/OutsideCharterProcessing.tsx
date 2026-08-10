"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const inputClass = cn(
  "w-full rounded-xl border border-white/15 bg-white/5 text-white transition-colors",
  "placeholder:text-white/35",
  "focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary",
  "disabled:opacity-60 disabled:cursor-not-allowed h-11 px-4"
);

export function OutsideCharterProcessing() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAskClick = () => {
    analytics.fishProcessingOutsideCharterLeadClicked("outside_charter_section");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("loading");
    setErrorMessage(null);
    const body = [
      "OUTSIDE CHARTER PROCESSING INQUIRY",
      `Lead source: cabo-fish-processing-outside`,
      message.trim(),
    ].join("\n\n");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: body,
        }),
      });
      if (!res.ok) {
        setErrorMessage(
          res.status === 429
            ? "Too many requests — please wait a moment and try again."
            : "Something went wrong. Try again or contact us."
        );
        setStatus("error");
        return;
      }
      analytics.contactSubmit("cabo-fish-processing-outside");
      setStatus("success");
    } catch {
      setErrorMessage("Something went wrong. Try again or contact us.");
      setStatus("error");
    }
  };

  return (
    <section
      id="outside-charter"
      className="scroll-mt-24 section-padding bg-brand-dark border-y border-white/5"
      aria-labelledby="outside-charter-heading"
    >
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 max-w-3xl">
        <p className="text-brand-primary text-xs font-bold tracking-[0.2em] uppercase mb-3">
          Didn&apos;t fish with Nasty?
        </p>
        <h2
          id="outside-charter-heading"
          className="font-display font-extrabold text-white text-3xl sm:text-4xl tracking-tight"
        >
          WE MAY STILL BE ABLE TO PROCESS YOUR CATCH.
        </h2>
        <p className="mt-4 text-white/70 text-base sm:text-lg leading-relaxed">
          Need Cabo fish processing after fishing with another charter? Contact us to confirm
          availability, species, catch size and drop-off timing.
        </p>

        {status === "success" ? (
          <div className="mt-8 flex flex-col items-start gap-2">
            <CheckCircle className="h-10 w-10 text-brand-primary" aria-hidden />
            <p className="text-white font-semibold">Request sent</p>
            <p className="text-white/60 text-sm">We&apos;ll confirm whether we can take your catch.</p>
          </div>
        ) : !open ? (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="rounded-xl font-bold tracking-wide" onClick={handleAskClick}>
              ASK ABOUT PROCESSING
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl border-white/30 text-white hover:bg-white/10">
              <Link href="/contact">Contact page</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4 max-w-lg">
            <div>
              <label htmlFor="outside-name" className="block text-sm text-white/80 mb-1.5">
                Name
              </label>
              <input
                id="outside-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                disabled={status === "loading"}
              />
            </div>
            <div>
              <label htmlFor="outside-email" className="block text-sm text-white/80 mb-1.5">
                Email
              </label>
              <input
                id="outside-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                disabled={status === "loading"}
              />
            </div>
            <div>
              <label htmlFor="outside-message" className="block text-sm text-white/80 mb-1.5">
                Catch details
              </label>
              <textarea
                id="outside-message"
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={cn(inputClass, "h-auto min-h-[112px] py-3 resize-y")}
                placeholder="Species, approximate weight, drop-off timing…"
                disabled={status === "loading"}
              />
            </div>
            {status === "error" && errorMessage ? (
              <p className="text-sm text-red-400">{errorMessage}</p>
            ) : null}
            <Button type="submit" size="lg" className="rounded-xl font-bold" disabled={status === "loading"}>
              {status === "loading" ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
