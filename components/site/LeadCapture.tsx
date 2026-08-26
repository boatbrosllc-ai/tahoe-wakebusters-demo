"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics";
import { getStoredAdsAttribution } from "@/lib/ads/attribution-client";
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
        body: JSON.stringify({
          email: email.trim(),
          source: "home_lead_capture",
          adsAttribution: getStoredAdsAttribution(),
        }),
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
    <motion.section
      className="section-padding bg-brand-dark"
      aria-labelledby="lead-capture-heading"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45 }}
    >
      <div className="container-narrow text-center">
        <h2 id="lead-capture-heading" className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-2">
          Get availability + tips
        </h2>
        <p className="text-white/80 mb-6 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
          Drop your email for seasonal availability, last-minute openings, and trip tips. No spam.
        </p>
        {status === "success" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 20, delay: 0 }}
            >
              <CheckCircle className="h-14 w-14 text-brand-primary shrink-0" aria-hidden />
            </motion.div>
            <motion.p
              className="text-white font-semibold text-lg"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              You&apos;re in!
            </motion.p>
            <motion.p
              className="text-white/80 text-sm max-w-sm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.18 }}
            >
              We&apos;ll send availability and trip tips. No spam, ever.
            </motion.p>
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
            <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} className="shrink-0">
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                disabled={status === "loading"}
                className="rounded-xl w-full sm:w-auto"
              >
                {status === "loading" ? "Sending…" : "Subscribe"}
              </Button>
            </motion.div>
          </form>
        )}
        {status === "error" && (
          <p className="mt-2 text-sm text-brand-primary">
            Something went wrong. Try again or call us.
          </p>
        )}
      </div>
    </motion.section>
  );
}
