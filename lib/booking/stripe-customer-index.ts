import type { DocumentReference } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { bookingWarn, redactEmail, type BookingLogStep } from "@/lib/booking/debug";

const STRIPE_CUSTOMER_INDEX_TTL_MS = 730 * 24 * 60 * 60 * 1000;

export function isStripeNoSuchCustomerError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { type?: string; code?: string; message?: string };
  if (e.code === "resource_missing") return true;
  if (typeof e.message === "string" && /no such customer/i.test(e.message)) return true;
  return false;
}

/**
 * `stripeCustomerIndex` may reference a cus_ id from another Stripe account (rotated keys) or a deleted customer.
 * If retrieve fails, clear the cached id so callers can list/create a customer for this account.
 */
export async function verifyIndexedStripeCustomerOrClear(
  stripe: Stripe,
  indexRef: DocumentReference,
  emailLower: string,
  customerId: string,
  logContext: BookingLogStep = "stripe-customer-index"
): Promise<string | null> {
  const id = customerId.trim();
  if (!id) return null;
  try {
    await stripe.customers.retrieve(id);
    return id;
  } catch (e) {
    if (!isStripeNoSuchCustomerError(e)) throw e;
    bookingWarn(
      logContext,
      "stripeCustomerIndex referenced missing Stripe customer (new API keys or customer deleted in Dashboard); clearing index",
      { emailRedacted: redactEmail(emailLower), staleCustomerIdPrefix: `${id.slice(0, 12)}…` }
    );
    const { FieldValue, Timestamp } = getFirestoreExports();
    await indexRef
      .set(
        {
          customerId: FieldValue.delete(),
          pending: false,
          pendingLockExpiresAt: FieldValue.delete(),
          recoverableError: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          expireAt: Timestamp.fromMillis(Date.now() + STRIPE_CUSTOMER_INDEX_TTL_MS),
        },
        { merge: true }
      )
      .catch((err) => {
        bookingWarn(logContext, "failed to clear stale stripeCustomerIndex", {
          emailRedacted: redactEmail(emailLower),
          err,
        });
      });
    return null;
  }
}
