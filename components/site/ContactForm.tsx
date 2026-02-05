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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      if (!res.ok) throw new Error("Submit failed");
      analytics.contactSubmit("contact_page");
      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
    }
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-brand-dark mb-1">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={status === "loading"}
          className={cn(
            "w-full h-11 px-4 rounded-xl border border-brand-dark/20 bg-white text-brand-dark",
            "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent",
            "disabled:opacity-60"
          )}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-brand-dark mb-1">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === "loading"}
          className={cn(
            "w-full h-11 px-4 rounded-xl border border-brand-dark/20 bg-white text-brand-dark",
            "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent",
            "disabled:opacity-60"
          )}
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-brand-dark mb-1">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          disabled={status === "loading"}
          className={cn(
            "w-full px-4 py-3 rounded-xl border border-brand-dark/20 bg-white text-brand-dark resize-y",
            "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent",
            "disabled:opacity-60"
          )}
        />
      </div>
      {status === "error" && (
        <p className="text-sm text-red-600">
          Something went wrong. Try again or call us.
        </p>
      )}
      <Button type="submit" disabled={status === "loading"} size="lg" className="rounded-xl w-full sm:w-auto">
        {status === "loading" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
