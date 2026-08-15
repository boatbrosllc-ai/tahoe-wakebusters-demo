"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runSeedAction } from "./actions";

type Props = {
  /** True when server has SEED_SECRET — setup key is required in every environment where seed can mutate production-like data. */
  seedSecretConfigured: boolean;
  /** Local dev bypass (SEED_OPEN_DEV) — never use in deployed environments. */
  allowOpenDevBypass: boolean;
};

export function AdminSeedForm({ seedSecretConfigured, allowOpenDevBypass }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [setupKey, setSetupKey] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [destructiveConfirm, setDestructiveConfirm] = useState(false);

  const requiresSetupKey = seedSecretConfigured;
  const showDevBypassBanner = allowOpenDevBypass;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await runSeedAction(setupKey.trim() || undefined, confirmPhrase.trim() || undefined);
      if (res.ok) {
        setResult({
          ok: true,
          message: `Done. ${res.experienceIds.length} experience(s) set up. The calendar will appear on experience pages.`,
        });
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
      {(requiresSetupKey || !allowOpenDevBypass) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Seeding can overwrite live operational data. When <code className="bg-amber-100/80 px-1 rounded text-xs">SEED_SECRET</code> is set
          on the server, the setup key, confirm phrase, and a signed-in admin session are required (plus a 24-hour per-admin rate limit).
        </div>
      )}
      {showDevBypassBanner && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Local open-dev mode: <code className="bg-emerald-100/80 px-1 rounded text-xs">SEED_OPEN_DEV=1</code> — no setup key required. Do not
          enable on production hosts.
        </div>
      )}
      {!requiresSetupKey && !allowOpenDevBypass && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <code className="bg-red-100/80 px-1 rounded text-xs">SEED_SECRET</code> is not set and open-dev bypass is off — the server will reject
          seed runs. Set <code className="bg-red-100/80 px-1 rounded text-xs">SEED_SECRET</code> or use documented local-only open dev.
        </p>
      )}
      {requiresSetupKey && (
        <div>
          <label htmlFor="setup-key" className="block text-sm font-medium text-brand-dark">
            Setup key (required)
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
      {requiresSetupKey && (
        <div>
          <label htmlFor="confirm-phrase" className="block text-sm font-medium text-brand-dark">
            Confirm phrase (required)
          </label>
          <input
            id="confirm-phrase"
            type="password"
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            placeholder="Same as SEED_CONFIRM_PHRASE in .env"
            autoComplete="off"
          />
        </div>
      )}
      {requiresSetupKey && (
        <label className="flex items-start gap-2 text-sm text-brand-dark">
          <input
            type="checkbox"
            checked={destructiveConfirm}
            onChange={(e) => setDestructiveConfirm(e.target.checked)}
            className="mt-1"
          />
          I understand this may create or update booking inventory in the connected Firestore project.
        </label>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full rounded-xl"
        disabled={
          loading ||
          (requiresSetupKey && (!destructiveConfirm || !setupKey.trim() || !confirmPhrase.trim()))
        }
      >
        {loading ? "Setting up…" : "Run setup"}
      </Button>
      <p className="text-xs text-brand-muted">
        This page is intentionally not linked from the main admin sidebar. Bookmark{" "}
        <code className="bg-brand-bg px-1 rounded">/admin/seed</code> only for initial environment setup.
      </p>
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
