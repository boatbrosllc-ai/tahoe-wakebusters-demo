import Link from "next/link";
import { AdminSeedForm } from "./AdminSeedForm";

export const metadata = {
  title: "Set up booking calendar",
  description: "One-time setup to enable the smart calendar and booking modal with Firestore.",
  robots: "noindex, nofollow",
};

export default function AdminSeedPage() {
  return (
    <div className="min-h-screen bg-brand-bg/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg mx-auto">
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-6 sm:p-8">
          <h1 className="text-xl font-bold text-brand-dark">Set up booking calendar</h1>
          <p className="mt-2 text-sm text-brand-muted">
            This creates the experiences, rates, add-ons, and availability in Firestore so the smart calendar and booking modal work on your experience pages. Run it once when you first set up, or after a fresh Firestore.
          </p>
          <AdminSeedForm />
          <p className="mt-6 text-xs text-brand-muted">
            <Link href="/admin" className="text-brand-primary hover:underline">
              Back to admin
            </Link>
            {" · "}
            <Link href="/experiences" className="text-brand-primary hover:underline">
              Back to experiences
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
