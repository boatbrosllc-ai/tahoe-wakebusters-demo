/**
 * Org-level provisioner identity. This is not a customer-site Firebase Admin account.
 * Never put this email in NEXT_PUBLIC_* or client bundles.
 */
export const SLIPSTACK_PROVISIONER_SA_EMAIL =
  "slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com";

export const PROVISIONING_TIMESTAMP_HEADER = "x-slipstack-provisioning-timestamp";
export const PROVISIONING_NONCE_HEADER = "x-slipstack-provisioning-nonce";
export const PROVISIONING_SIGNATURE_HEADER = "x-slipstack-provisioning-signature";

/** Acceptable skew for signed worker requests (seconds). */
export const PROVISIONING_TS_WINDOW_SEC = 5 * 60;

export const DEPRECATED_PROVISIONING_JSON_ENV = "GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON";
export const DEPRECATED_PROVISIONING_JSON_B64_ENV = "GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON_B64";
