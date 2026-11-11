# Server-rendered developer dashboard

Open `/api/dashboard` on the backend domain. Unauthenticated requests redirect to `/api/dashboard/login`. The dashboard is part of the NestJS application; no frontend build or separate hosting is required.

## Features

- Email/password sign-in for existing verified, active MyTrackr accounts. The dashboard uses password-only authentication; credential rotation and revocation require password confirmation.
- Account overview, real accepted-event totals, and month-to-date payment/refund totals grouped by currency.
- Paginated website integrations, event history, and outbound webhook delivery history.
- Create website integrations; edit names, platforms, allowed origins, redirect URLs, and webhook URLs.
- Public-key copy, one-time API-key reveal, immediate key rotation, and revocation with password confirmation.
- Per-integration webhook HMAC secrets, encrypted at rest, shown once on creation/rotation. Failed deliveries can be retried up to five times by their owner, only to the integration's current endpoint.
- Current subscription and plan details, Web subscription checkout, and payment-reference verification. Already eligible subscribers cannot accidentally start another Web checkout.
- Public, server-rendered platform guides at `/developers/guides` with snapshots and walkthroughs for React, Vue, Flutter, WordPress, server-side integrations, API keys, and Paystack. Events affect actual finance records; there is no isolated sandbox or synthetic request-log feature.

## Main dashboard compatibility and setup guide

Website integrations can be created in the main app at `https://dashboard.mytrackrservices.com/dashboard` (Secondary account → Link Website → Link Website) or in `/api/dashboard/integrations`. Both use `IntegrationsService.create()` and the same account-owned integrations. Creating the same website in both places is unnecessary.

Direct merchant Paystack connection remains in the main app's Payment Gateway tab, backed by `POST /integrations/paystack/connect`; request imports through `POST /integrations/paystack/sync`. The developer dashboard does not currently include a merchant Paystack connection form. Account authentication and the appropriate subscription capabilities still apply. The legacy website `planSlug` field is accepted but ignored.

The public guides at `/developers/guides/api-keys` and `/developers/guides/paystack` include the main-dashboard screenshots and authenticated Bash/cURL examples. The PDF includes these walkthroughs on pages 11–13. Only the API-key screenshot with a placeholder value is shipped.

Regenerate the standalone HTML with `node scripts/generate-developer-pdf.cjs`. With a local headless Chromium/Edge debugging endpoint on port 9338, run `node scripts/render-developer-pdf.cjs` to validate page bounds and export the PDF. Generated files are in `artifacts/developer-guide`.

## Deployment

1. Apply the additive database change before deploying application code if schema synchronization is disabled:

   ```sql
   ALTER TABLE integrations
     ADD COLUMN IF NOT EXISTS "webhookSigningSecret" jsonb NULL;
   ```

   The repository's current TypeORM configuration has `synchronize: true` and will also create this column. For managed production deployments, apply schema changes through your normal migration process.

2. Use HTTPS and set `NODE_ENV=production`. Production dashboard cookies use the browser-enforced `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no Domain attribute, preventing sibling subdomains from injecting session/CSRF cookies. Their names are separate from the main app's cookies. Local HTTP development uses non-secure cookies scoped to `/api/dashboard` outside production.
3. Existing database, Redis, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_PASSWORD`, and payment-provider configuration must be available. Keep the encryption password stable: existing webhook secrets cannot be decrypted if it changes without key migration.
4. Forward all `/api/dashboard/*` routes to this NestJS service and do not cache HTML responses. CSS is served by the same backend. Preserve request bodies for form POSTs. Ensure the reverse proxy supplies a trustworthy client IP for throttling; do not enable Express `trust proxy` indiscriminately.
5. Keep a shared Redis instance across application workers. Signed form tokens are bound to the browser and session, expire after 15 minutes, and can be consumed once. Rate limits, assured dashboard sessions, and mutation locks use Redis and fail closed when unavailable.
6. Payment return URLs continue to use the existing `PAYSTACK_CALLBACK_URL`; the dashboard does not overwrite that global setting. Payment webhooks normally activate access. Customers can also paste their own payment reference into Billing to verify it.

Dashboard access/refresh cookies are separate from the main application's cookies. Expired access tokens refresh against the existing session service. Revoked or inactive sessions must sign in again. Google-only users must first establish a password through the existing account recovery flow. MFA is not supported by the developer dashboard at this stage.

## Webhook compatibility and verification

New integrations return both `apiKey` and `webhookSigningSecret` once on creation. Existing list/config responses do not reveal signing secrets or encrypted values. Legacy integrations retain the existing `INTEGRATION_WEBHOOK_SECRET` fallback until the owner rotates the signing secret in the dashboard. Never distribute the platform-wide fallback to new customers.

The header is `x-mytrackr-signature: sha256=<hex HMAC-SHA256 of the exact raw JSON request body>`. Verify with the integration's signing secret using a timing-safe comparison. Reject invalid signatures; deduplicate the `x-mytrackr-delivery-id` before applying changes. Return 2xx after safely accepting the event. Retries preserve the original delivery ID and body, use the current signing secret, and are rate limited. Rotating a secret takes effect immediately; update the receiving server accordingly.

Delivery requires a public HTTPS destination on port 443. Each connection resolves DNS, rejects private/reserved addresses (including mixed public/private DNS answers), and pins the connection to a vetted address. Redirects and environment HTTP proxies are disabled. HTTP, local-network, and unsigned legacy webhook deliveries now fail closed and appear as failed deliveries.

Secret keys are shown directly in the successful creation/rotation response, with `Cache-Control: no-store` and a restrictive CSP. They are not kept in local/session storage, redirects, or flash cookies. Browser navigation clears secret fields. If the response is lost, rotate the key; it cannot be recovered. Do not refresh/resubmit a key-creation response: its consumed form token prevents repeating the mutation.

The dashboard uses existing integration and subscription services and inherits their finance-event ingestion behavior. It does not introduce automatic webhook retry scheduling, background queues, integration sandboxing, or per-request API telemetry.

## Validation

Run `npm run build` and the dashboard, URL-security, and webhook-delivery Jest suites. HTTP tests exercise the real JWT strategy, dashboard auth guard, form validation, CSRF checks, and HTML rendering with mocked database/payment dependencies. They do not prove live payment-provider behavior, live DNS delivery, database migration execution, or browser layout. Verify those against a staging deployment before release.
