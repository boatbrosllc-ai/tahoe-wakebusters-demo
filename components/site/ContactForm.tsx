"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);

  const submitWithValues = async (n: string, em: string, msg: string) => {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n.trim(), email: em.trim(), message: msg.trim() }),
    });
    if (!res.ok) {
      if (res.status === 429) {
        setErrorMessage("Too many requests — please wait a moment and try again.");
        setShowRetry(false);
      } else {
        setErrorMessage("Something went wrong. Try again or call us.");
        setShowRetry(true);
      }
      setStatus("error");
      return;
    }
    analytics.contactSubmit("contact_page");
    setStatus("success");
    setErrorMessage(null);
    setShowRetry(false);
    setName("");
    setEmail("");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("loading");
    setErrorMessage(null);
    setShowRetry(false);
    try {
      await submitWithValues(name, email, message);
    } catch {
      setErrorMessage("Something went wrong. Try again or call us.");
      setShowRetry(true);
      setStatus("error");
    }
  };

  const handleRetry = () => {
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("loading");
    setErrorMessage(null);
    setShowRetry(false);
    void submitWithValues(name, email, message).catch(() => {
      setErrorMessage("Something went wrong. Try again or call us.");
      setShowRetry(true);
      setStatus("error");
    });
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="flex flex-col items-center gap-3 py-4 text-center"
      >
        <CheckCircle className="h-12 w-12 text-brand-primary shrink-0" aria-hidden />
        <p className="text-brand-dark font-semibold text-lg">Message sent</p>
        <p className="text-brand-muted text-sm">
          We&apos;ll get back to you soon—usually within a few hours.
        </p>
      </motion.div>
    );
  }

  const inputBase = cn(
    "w-full rounded-xl border border-brand-dark/15 bg-brand-bg/50 text-brand-dark transition-colors",
    "placeholder:text-brand-muted/70",
    "focus:outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary focus:bg-white",
    "disabled:opacity-60 disabled:cursor-not-allowed"
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-brand-dark mb-1.5">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={status === "loading"}
          placeholder="Your name"
          className={cn(inputBase, "h-11 px-4")}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-brand-dark mb-1.5">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === "loading"}
          placeholder="you@example.com"
          className={cn(inputBase, "h-11 px-4")}
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-brand-dark mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          disabled={status === "loading"}
          placeholder="How can we help?"
          className={cn(inputBase, "min-h-[112px] px-4 py-3 resize-y")}
        />
      </div>
      {status === "error" && errorMessage && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{errorMessage}</p>
          {showRetry && (
            <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          )}
        </div>
      )}
      <Button type="submit" disabled={status === "loading"} size="lg" className="rounded-xl w-full sm:w-auto mt-1">
        {status === "loading" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
