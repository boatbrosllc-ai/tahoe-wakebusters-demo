"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runSeedAction } from "./actions";

export function AdminSeedForm() {
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
        setResult({ ok: true, message: `Done. ${res.experienceIds.length} experience(s) set up. The calendar will appear on experience pages.` });
      } else {
        setResult({ ok: false, message: res.error });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
        {loading ? "Setting up…" : "Run setup"}
      </Button>
      {result && (
        <p
          className={`text-sm ${result.ok ? "text-green-700 bg-green-50 border border-green-200" : "text-red-700 bg-red-50 border border-red-200"} rounded-xl px-4 py-3`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
