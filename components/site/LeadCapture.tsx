"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function LeadCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "home_lead_capture" }),
      });
      if (!res.ok) throw new Error("Submit failed");
      analytics.leadSubmit("home_lead_capture", "home");
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="section-padding bg-brand-dark" aria-labelledby="lead-capture-heading">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center">
        <h2 id="lead-capture-heading" className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Get availability + tips
        </h2>
        <p className="text-white/80 mb-6 max-w-md mx-auto">
          Drop your email for seasonal availability, last-minute openings, and Lake Travis & Lake Austin tips. No spam.
        </p>
        {status === "success" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="flex flex-col items-center gap-3"
          >
            <CheckCircle className="h-14 w-14 text-brand-primary shrink-0" aria-hidden />
            <p className="text-white font-semibold text-lg">You&apos;re in!</p>
            <p className="text-white/80 text-sm max-w-sm">
              We&apos;ll send availability and Lake Travis & Lake Austin tips. No spam, ever.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <label htmlFor="lead-email" className="sr-only">
              Email address
            </label>
            <input
              id="lead-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={status === "loading"}
              className={cn(
                "flex-1 min-w-0 h-12 px-4 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder:text-white/50",
                "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent",
                "disabled:opacity-60"
              )}
              autoComplete="email"
            />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              disabled={status === "loading"}
              className="rounded-xl shrink-0"
            >
              {status === "loading" ? "Sending…" : "Subscribe"}
            </Button>
          </form>
        )}
        {status === "error" && (
          <p className="mt-2 text-sm text-brand-primary">
            Something went wrong. Try again or call us.
          </p>
        )}
      </div>
    </section>
  );
}
