# Keyless org provisioner auth

Netlify Functions in this project do **not** expose an OIDC JWT that Google Workload Identity Federation can verify. Official Netlify function `Context` has site/deploy/geo metadata only — no identity token. Official Netlify env vars (`NETLIFY`, `SITE_ID`, `URL`, …) are not signed Google-trustable credentials.

Do **not** disable `iam.managed.disableServiceAccountKeyCreation`.
Do **not** download a JSON key for `slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com`.

## Architecture

```text
Netlify (slipstack.io / control plane)
  → HMAC-signed HTTPS POST
Cloud Run (project slipstack-org-setup)
  → Application Default Credentials from the metadata server
  → acts as slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com
  → Resource Manager / Firebase APIs (create job not implemented yet)
```

The HMAC secret is **not** a Google private key. It only proves the caller knows `PROVISIONING_WORKER_SECRET`. Cloud Run IAM `roles/run.invoker` cannot be bound to Netlify because Netlify has no Google identity.

## Google Cloud (manual)

In project `slipstack-org-setup`:

1. Enable APIs: `run.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, `cloudresourcemanager.googleapis.com`, `serviceusage.googleapis.com`.
2. Keep `slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com` as **Project Creator** on folder `slipstack-customers`.
3. Deploy Cloud Run service `slipstack-provisioner` from `provisioning/worker/Dockerfile`.
4. Set the Cloud Run **runtime service account** to `slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com` (preserves Project Creator; no impersonation required).
5. Cloud Run env:
   - `PROVISIONING_RUNTIME=cloudrun`
   - `PROVISIONING_WORKER_SECRET` (32+ random bytes; same value as Netlify)
   - `GOOGLE_CLOUD_PROJECT=slipstack-org-setup`
   - `GOOGLE_PROVISIONING_SERVICE_ACCOUNT_EMAIL=slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com`
6. Because Netlify cannot present a Google ID token, this one service must allow unauthenticated HTTP ingress. Authorization is the HMAC in `lib/provisioning/worker-hmac.ts`. Do **not** grant `allUsers` invoker on any other service.
7. Do **not** create a Workload Identity Pool for Netlify. There is no issuer, audience, or JWKS to configure.

### IAM roles

| Principal | Role | Resource |
| --- | --- | --- |
| `slipstack-provisioner@…` | `roles/resourcemanager.projectCreator` | folder `slipstack-customers` (already granted) |
| Deployer (you) | `roles/run.admin` | project `slipstack-org-setup` |
| Deployer (you) | `roles/iam.serviceAccountUser` | the provisioner SA (required to attach it to Cloud Run) |
| `allUsers` | `roles/run.invoker` | **only** the `slipstack-provisioner` Cloud Run service |
| Your user (local ADC impersonation) | `roles/iam.serviceAccountTokenCreator` | the provisioner SA |

Optional later, when create is implemented: billing attach roles, `roles/serviceusage.serviceUsageAdmin`, Firebase Management. Not required for auth.

## Netlify (manual)

On the control-plane site, **Functions** scope, production:

- `PROVISIONING_WORKER_URL` = Cloud Run URL (`https://….run.app`)
- `PROVISIONING_WORKER_SECRET` = same secret as Cloud Run

Do **not** set:

- `GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PROVISIONING_SERVICE_ACCOUNT_JSON_B64`
- any `NEXT_PUBLIC_*` provisioning variable

## Local

```bash
gcloud auth application-default login
# optional, to act as the provisioner:
# GOOGLE_PROVISIONING_IMPERSONATE_SA=slipstack-provisioner@slipstack-org-setup.iam.gserviceaccount.com
```

Tests: `PROVISIONING_USE_MOCK=1` (or the unit tests set it).

## Code entry

Control plane: `runProvisioningJob()` in `lib/provisioning/jobs.ts`.
Worker: `npx tsx provisioning/worker/server.ts`.
