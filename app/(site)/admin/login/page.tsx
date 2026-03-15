"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const configError = searchParams.get("error") === "config";
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState<{
    adminEmailSet: boolean;
    firebaseConfigured: boolean;
    projectIdsMatch: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/session?config=1", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { config?: { adminEmailSet: boolean; firebaseConfigured: boolean; projectIdsMatch: boolean } }) => {
        if (data.config) setConfigStatus(data.config);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (configError) {
      setError(
        "Admin configuration error: Firebase or server config is missing or invalid. Check your deployment environment (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). For diagnostics, open the health endpoint."
      );
    }
  }, [configError]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const auth = getFirebaseAuth();
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await userCred.user.getIdToken();
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint = (data as { hint?: string }).hint;
        if (res.status === 403) {
          setError("This email is not the admin account. Sign in with the exact email set as ADMIN_EMAIL for this site.");
        } else if ((data as { code?: string }).code === "FIREBASE_PROJECT_MISMATCH") {
          setError(hint ?? "In Netlify, set FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID to the same Firebase project ID.");
        } else if (res.status === 401) {
          const detail = (data as { detail?: string }).detail;
          const msg = detail ? `${hint ?? (data as { error?: string }).error ?? "Invalid or expired token"}. Server: ${detail}` : (hint ?? (data as { error?: string }).error ?? "Invalid or expired token");
          setError(msg);
          if (hint) console.error("[admin login] 401 hint:", hint);
        } else {
          setError((data as { error?: string }).error ?? "Login failed");
        }
        return;
      }
      setSuccess(true);
      // Full page navigation so the session cookie is sent; replace() avoids back-button returning to login
      const redirectTo = (data as { redirect?: string }).redirect ?? "/admin";
      window.location.replace(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found")) {
        setError(
          "Invalid email or password. Use the same email as ADMIN_EMAIL. Forgot password? Use the link below to reset it."
        );
      } else if (msg.includes("auth/") || msg.includes("identitytoolkit")) {
        setError(
          "Invalid email or password. In Firebase Console enable Authentication → Sign-in method → Email/Password, then add the user under Users (email must match ADMIN_EMAIL)."
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const resetEmail = email.trim();
    if (!resetEmail) {
      setError("Enter your admin email to receive a password reset link.");
      return;
    }
    setResetLoading(true);
    setError(null);
    setResetSent(false);
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("auth/user-not-found")) {
        setError("No account with that email. Use the exact admin email (ADMIN_EMAIL).");
      } else {
        setError(msg);
      }
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg/50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-6 sm:p-8">
        <h1 className="text-xl font-bold text-brand-dark">Admin sign-in</h1>
        <p className="mt-1 text-sm text-brand-muted">Sign in with your admin email and password.</p>

        {configStatus && (
          <div className="mt-4 rounded-lg border border-brand-dark/15 bg-brand-bg/50 p-3 text-xs">
            <p className="font-semibold text-brand-dark mb-1.5">Server configuration</p>
            <ul className="space-y-0.5 text-brand-muted">
              <li className={configStatus.adminEmailSet ? "text-green-700" : "text-red-600"}>
                {configStatus.adminEmailSet ? "✓" : "✗"} ADMIN_EMAIL is set
              </li>
              <li className={configStatus.firebaseConfigured ? "text-green-700" : "text-red-600"}>
                {configStatus.firebaseConfigured ? "✓" : "✗"} Firebase server config (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
              </li>
              <li className={configStatus.projectIdsMatch ? "text-green-700" : "text-red-600"}>
                {configStatus.projectIdsMatch ? "✓" : "✗"} FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID match
              </li>
            </ul>
            {(!configStatus.adminEmailSet || !configStatus.firebaseConfigured || !configStatus.projectIdsMatch) && (
              <p className="mt-2 text-red-600 font-medium">Fix the items above in .env.local or your deployment env, then restart the dev server or redeploy.</p>
            )}
          </div>
        )}

        {!showReset ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-brand-dark">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="boatbrosll@gmail.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-brand-dark">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            {configError && (
              <p className="text-sm text-brand-muted mt-2">
                <Link href="/api/health" target="_blank" rel="noopener noreferrer" className="text-brand-primary font-medium hover:underline">
                  Open /api/health for diagnostics
                </Link>
              </p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Sign in successful, redirecting…
              </p>
            )}
            {success && (
              <p className="text-sm text-brand-muted">
                If you are not redirected, <Link href="/admin" className="text-brand-primary font-medium hover:underline">go to the dashboard</Link>.
              </p>
            )}
            <Button type="submit" size="lg" className="w-full rounded-xl" disabled={loading || success}>
              {loading ? "Signing in…" : success ? "Redirecting…" : "Sign in"}
            </Button>
            <p className="text-center">
              <button
                type="button"
                onClick={() => { setShowReset(true); setError(null); setResetSent(false); }}
                className="text-sm text-brand-primary hover:underline"
              >
                Forgot password?
              </button>
            </p>
          </form>
        ) : (
          <div className="mt-6 pt-2 border-t border-brand-dark/10 space-y-2">
            <p className="text-sm text-brand-muted">Enter your admin email to receive a password reset link.</p>
            <form onSubmit={handleForgotPassword} className="space-y-2" id="reset-form">
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Admin email (same as ADMIN_EMAIL)"
                className="block w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                autoComplete="email"
              />
              <Button type="submit" variant="outline" size="sm" className="w-full" disabled={resetLoading}>
                {resetLoading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            {resetSent && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Check your email for a link to reset your password.
              </p>
            )}
            <p className="text-center">
              <button
                type="button"
                onClick={() => { setShowReset(false); setError(null); setResetSent(false); }}
                className="text-sm text-brand-primary hover:underline"
              >
                Back to sign in
              </button>
            </p>
          </div>
        )}

        <p className="mt-4 text-xs text-brand-muted">
          <Link href="/" className="text-brand-primary hover:underline">
            Back to site
          </Link>
        </p>
        <p className="mt-2 text-xs text-brand-muted">
          If you see 401 or a securetoken 400: check deployment logs for [admin/session]. Ensure FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID match, FIREBASE_PRIVATE_KEY is full PEM with <code className="bg-black/5 px-1 rounded">\n</code> for newlines, ADMIN_EMAIL is set, and your site domain is in Firebase Console → Authentication → Settings → Authorized domains.
        </p>
      </div>
    </div>
  );
}
