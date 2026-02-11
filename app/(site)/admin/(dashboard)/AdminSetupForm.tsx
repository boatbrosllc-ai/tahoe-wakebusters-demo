"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runSeedAction } from "./seed/actions";

interface AdminSetupFormProps {
  experienceCount: number;
}

export function AdminSetupForm({ experienceCount }: AdminSetupFormProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [setupKey, setSetupKey] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await runSeedAction(setupKey.trim() || undefined);
      if (res.ok) {
        setResult({
          ok: true,
          message: `Done. ${res.experienceIds.length} experience(s) set up. Refresh this page to see the calendar and booking flow on experience pages.`,
        });
      } else {
        const msg =
          /quota exceeded|RESOURCE_EXHAUSTED/i.test(res.error)
            ? "Firestore quota exceeded. Wait a few minutes and try again, or upgrade your Firestore plan in the Firebase Console."
            : res.error;
        setResult({ ok: false, message: msg });
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {process.env.NODE_ENV === "production" && (
        <div>
          <label htmlFor="setup-key" className="block text-sm font-medium text-brand-dark">
            Setup key (required in production)
          </label>
          <input
            id="setup-key"
            type="password"
            value={setupKey}
            onChange={(e) => setSetupKey(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            placeholder="Same as SEED_SECRET in .env"
            autoComplete="off"
          />
        </div>
      )}
      <Button type="submit" size="lg" className="w-full rounded-xl" disabled={loading}>
        {loading ? "Setting up…" : experienceCount > 0 ? "Re-run setup (idempotent)" : "Run setup"}
      </Button>
      {result && (
        <p
          className={`text-sm rounded-xl px-4 py-3 ${
            result.ok
              ? "text-green-700 bg-green-50 border border-green-200"
              : "text-red-700 bg-red-50 border border-red-200"
          }`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
