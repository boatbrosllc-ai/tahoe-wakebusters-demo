"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { notifyAdminAuthChanged } from "@/lib/admin-auth-client";
import { brand } from "@/content/brand";
import { AuthUI, Input, Label, PasswordInput, Button } from "@/components/ui/auth-ui";

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

  useEffect(() => {
    if (configError) {
      setError("Sign-in is temporarily unavailable. Please try again shortly.");
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
        if (res.status === 403) {
          setError("This account doesn’t have admin access. Use the email you were invited with.");
        } else if (res.status === 401) {
          setError("Sign-in failed. Check your email and password, then try again.");
        } else {
          setError((data as { error?: string }).error ?? "Login failed");
        }
        return;
      }
      setSuccess(true);
      notifyAdminAuthChanged();

      const raw = (data as { redirect?: string }).redirect;
      const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/admin";
      const target = new URL(path, window.location.origin).href;

      const navigate = () => {
        window.location.replace(target);
      };
      window.setTimeout(navigate, 0);
      window.setTimeout(() => {
        if (
          window.location.pathname === "/admin/login" ||
          window.location.pathname.startsWith("/admin/login/")
        ) {
          window.location.href = target;
        }
      }, 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("auth/invalid-credential") ||
        msg.includes("auth/wrong-password") ||
        msg.includes("auth/user-not-found") ||
        msg.includes("auth/") ||
        msg.includes("identitytoolkit")
      ) {
        setError("Invalid email or password.");
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
      setError("Enter your email to receive a password reset link.");
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
        setError("No account with that email.");
      } else {
        setError(msg);
      }
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <AuthUI
      content={{
        image: {
          src: "/photos/wakebusters/tahoe-shoreline.jpg",
          alt: "Lake Tahoe shoreline with Sierra mountains",
        },
        quote: {
          text: "Welcome back. The lake is waiting.",
          author: brand.companyName,
        },
      }}
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {(brand.logoPath || brand.logoDesktopPath) && (
            <Image
              src={brand.logoDesktopPath || brand.logoPath}
              alt={brand.logoAlt || brand.companyName}
              width={140}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          )}
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-brand-dark">Admin sign-in</h1>
            <p className="text-balance text-sm text-brand-muted">
              Sign in with your team account to manage bookings and the calendar.
            </p>
          </div>
        </div>

        {!showReset ? (
          <form onSubmit={handleSubmit} autoComplete="on" className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <PasswordInput
              name="password"
              label="Password"
              required
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Sign in successful, redirecting…
              </p>
            )}
            {success && (
              <p className="text-sm text-brand-muted">
                If you are not redirected,{" "}
                <Link href="/admin" className="font-medium text-brand-primary hover:underline">
                  go to the dashboard
                </Link>
                .
              </p>
            )}

            <Button type="submit" className="mt-1 w-full" disabled={loading || success}>
              {loading ? "Signing in…" : success ? "Redirecting…" : "Sign In"}
            </Button>

            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setShowReset(true);
                  setError(null);
                  setResetSent(false);
                }}
                className="text-brand-primary hover:underline"
              >
                Forgot password?
              </button>
            </p>
          </form>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-brand-muted">
              Enter your email to receive a password reset link.
            </p>
            <form onSubmit={handleForgotPassword} className="grid gap-4" id="reset-form">
              <div className="grid gap-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
              <Button type="submit" variant="outline" className="w-full" disabled={resetLoading}>
                {resetLoading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {resetSent && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Check your email for a link to reset your password.
              </p>
            )}
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setShowReset(false);
                  setError(null);
                  setResetSent(false);
                }}
                className="text-brand-primary hover:underline"
              >
                Back to sign in
              </button>
            </p>
          </div>
        )}

        <p className="text-center text-sm text-brand-muted">
          <Link href="/" className="text-brand-primary hover:underline">
            Back to site
          </Link>
        </p>
      </div>
    </AuthUI>
  );
}
