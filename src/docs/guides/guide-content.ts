export type GuideSection = { id: string; title: string; html: string };
export type PlatformGuide = {
  slug: string;
  title: string;
  summary: string;
  category: 'Start here' | 'Platforms' | 'Payments' | 'Go live';
  icon: string;
  minutes: number;
  sections: GuideSection[];
  related: string[];
  sources?: Array<{ title: string; url: string }>;
};

export const escapeGuideHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const e = escapeGuideHtml;
const p = (text: string) => `<p>${text}</p>`;
const list = (...items: string[]) =>
  `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
const note = (title: string, text: string) =>
  `<aside class="guide-note"><strong>${title}</strong><p>${text}</p></aside>`;
const code = (id: string, filename: string, source: string) =>
  `<div class="code-block"><div class="code-heading"><span>${e(filename)}</span><button type="button" data-copy="${e(id)}">Copy code</button></div><pre><code id="${e(id)}">${e(source)}</code></pre></div>`;
const snapshot = (file: string, caption: string, alt: string) =>
  `<figure class="snapshot"><a href="/developers/assets/${file}" target="_blank" rel="noopener"><img src="/developers/assets/${file}" alt="${e(alt)}" loading="lazy" width="1440" height="1080"></a><figcaption><b>${e(caption)}</b><span>MyTrackr preview with sample data. Select the image to open it at full size.</span></figcaption></figure>`;
const mainDashboardSnapshot = (file: string, caption: string) =>
  `<figure class="snapshot"><a href="/developers/assets/${file}" target="_blank" rel="noopener"><img src="/developers/assets/${file}" alt="${e(caption)}" loading="lazy"></a><figcaption><b>${e(caption)}</b><span>Main MyTrackr dashboard walkthrough. Values shown are examples, not credentials to use.</span></figcaption></figure>`;
export const createIntegrationSample = `curl -X POST "https://api.mytrackrservices.com/integrations" \\
  -H "Authorization: Bearer $MYTRACKR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data '{
    "name": "My Online Store",
    "platform": "react",
    "allowedOrigins": ["https://mystore.com"],
    "redirectUrl": "https://mystore.com/integrations/mytrackr/callback",
    "webhookUrl": "https://mystore.com/integrations/mytrackr/webhook"
  }'`;
export const connectPaystackSample = `curl -X POST "https://api.mytrackrservices.com/integrations/paystack/connect" \\
  -H "Authorization: Bearer $MYTRACKR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data "{\\"secretKey\\":\\"$PAYSTACK_SECRET_KEY\\"}"`;
export const architectureDiagram = `<figure class="architecture"><div class="flow-node"><span class="flow-icon">01</span><strong>Your website or app</strong><small>React · Vue · Flutter</small><em>Customer session only</em></div><span class="flow-arrow" aria-hidden="true">→</span><div class="flow-node server"><span class="flow-icon">02</span><strong>Your backend</strong><small>Verify payment · load order</small><em>Secret API key stays here</em></div><span class="flow-arrow" aria-hidden="true">→</span><div class="flow-node"><span class="flow-icon">03</span><strong>MyTrackr</strong><small>Accept event · update records</small><em>Check Events in your dashboard</em></div><figcaption>A connection in three steps. Your backend is the trusted bridge.</figcaption></figure>`;
const prerequisites = () =>
  p(
    'Before starting, <a href="/developers/guides/api-keys">create a MyTrackr integration and save its API key</a>. You need an active plan with website linking, a verified account, and a backend you control.',
  ) +
  note(
    'Which address do I use?',
    '<code>MYTRACKR_API_URL</code> is the HTTPS origin of the MyTrackr backend hosting this page. Your website’s backend has a different address. Examples beginning <code>/api/orders/…</code> are routes you implement on your own backend; they are not built-in MyTrackr endpoints.',
  );
const clientSafety = () =>
  note(
    'Keep the secret on your server',
    'Never put <code>mt_sk_…</code>, a Paystack secret key, or a webhook signing secret in frontend environment variables, a Flutter bundle, public WordPress settings, or a URL. Use your customer’s normal session to talk to your backend.',
  );
const commonChecks = () =>
  list(
    'Use a real order belonging to the signed-in customer.',
    'Confirm the payment on your backend before creating an <code>order.paid</code> event.',
    'Use the same external event ID on retries. Generate different IDs for refunds or other event types.',
    'Open <a href="/api/dashboard/events">Dashboard → Events</a> and match the order reference.',
    'MyTrackr has no isolated integration sandbox. Test with a separate test business; sample events affect that business’s financial records.',
  );

export const serverSenderSource = `// mytrackr.mjs — runs on YOUR server only
const origin = process.env.MYTRACKR_API_URL;
const apiKey = process.env.MYTRACKR_API_KEY;

export async function recordPaidOrder(order) {
  if (!origin || !apiKey) throw new Error('Configure MyTrackr server variables');
  if (!order.id || order.paymentStatus !== 'paid') {
    throw new Error('A verified paid order is required');
  }
  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount < 0 || !order.currency) {
    throw new Error('Invalid order amount or currency');
  }
  const paidAt = new Date(order.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw new Error('Invalid payment date');
  const endpoint = new URL('/integrations/events', origin);
  if (endpoint.protocol !== 'https:') throw new Error('Use your HTTPS backend origin');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mytrackr-api-key': apiKey,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      event: 'order.paid',
      externalId: 'store:' + order.id + ':paid',
      orderId: String(order.id),
      amount,
      currency: order.currency,
      occurredAt: paidAt.toISOString(),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error('MyTrackr sync failed: ' + response.status);
  return result; // { id, externalId, duplicate }
}`;

const reactSource = `// src/components/SyncOrder.jsx
import { useState } from 'react';

export default function SyncOrder({ orderId, csrfToken }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function sync() {
    setBusy(true);
    setMessage('');
    try {
      // Your backend authenticates the customer and loads the paid order.
      const response = await fetch('/api/orders/' + encodeURIComponent(orderId) + '/sync', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || !result.synced) throw new Error('Sync could not be confirmed');
      setMessage('Order synced.');
    } catch {
      setMessage('Unable to confirm sync. Retry using the same order.');
    } finally { setBusy(false); }
  }

  return <div>
    <button disabled={busy} onClick={sync}>{busy ? 'Syncing…' : 'Sync order'}</button>
    <p role="status">{message}</p>
  </div>;
}`;
const vueSource = `<script setup>
import { ref } from 'vue';
const props = defineProps({ orderId: String, csrfToken: String });
const busy = ref(false);
const message = ref('');

async function sync() {
  busy.value = true;
  message.value = '';
  try {
    const response = await fetch('/api/orders/' + encodeURIComponent(props.orderId) + '/sync', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-CSRF-Token': props.csrfToken },
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.synced) throw new Error('Sync could not be confirmed');
    message.value = 'Order synced.';
  } catch {
    message.value = 'Unable to confirm sync. Retry using the same order.';
  } finally { busy.value = false; }
}
</script>

<template>
  <button :disabled="busy" @click="sync">{{ busy ? 'Syncing…' : 'Sync order' }}</button>
  <p role="status">{{ message }}</p>
</template>`;
const flutterSource = `// lib/services/mytrackr_sync.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<void> syncPaidOrder({
  required String orderId,
  required String customerAccessToken,
}) async {
  // Replace this origin with YOUR application backend.
  final uri = Uri.https('your-backend.example.com', '/').replace(
    pathSegments: ['api', 'orders', orderId, 'sync'],
  );
  final response = await http.post(uri, headers: {
    // This is the signed-in customer's token for YOUR backend.
    'Authorization': 'Bearer ' + customerAccessToken,
  }).timeout(const Duration(seconds: 15));
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw Exception('Unable to confirm sync. Retry the same order.');
  }
  final body = jsonDecode(response.body) as Map<String, dynamic>;
  if (body['synced'] != true) throw Exception('Sync not confirmed');
}`;

export const guides: PlatformGuide[] = [
  {
    slug: 'api-keys',
    title: 'Find your MyTrackr API keys — with snapshots',
    icon: 'key',
    category: 'Start here',
    minutes: 6,
    summary:
      'Create your first integration, find the API keys screen, and save the right credentials—with snapshots.',
    related: ['server', 'react', 'paystack'],
    sections: [
      {
        id: 'choose-dashboard',
        title: 'Choose either dashboard for website setup',
        html:
          p(
            'You can create a website integration from <a href="https://dashboard.mytrackrservices.com/dashboard">the main MyTrackr dashboard</a> or <a href="/api/dashboard/integrations">the developer dashboard</a>. Both use the same integration service and create integrations for the signed-in account. You do not need to create the same website twice. Use the same account to manage its keys, settings, and events in the developer dashboard.',
          ) +
          p(
            'For direct Paystack sync, use <strong>Payment Gateway → Connect Paystack</strong> in the main dashboard. The developer dashboard currently manages website integrations; it does not have a merchant Paystack connection form.',
          ),
      },
      {
        id: 'main-dashboard-website',
        title: 'Create from the main MyTrackr dashboard',
        html:
          list(
            'Sign in to the main dashboard, find the <strong>Secondary account</strong> card, and select <strong>Link Website</strong>.',
            'In the modal, choose <strong>Link Website</strong>. Enter Website Name, Platform, and Allowed Origins. Separate multiple origins with commas.',
            'For example: name <code>My Online Store</code>, platform <strong>React / Next.js</strong>, origin <code>https://mystore.com</code>. The API platform value is <code>react</code>.',
            'Redirect URL and Webhook URL are optional. Use your own implemented callback and public HTTPS webhook endpoints, or leave them blank.',
            'Select <strong>Generate API Key</strong>, copy the secret into your server secret settings, then select <strong>Done</strong>. You can manage this integration later in the developer dashboard.',
          ) +
          mainDashboardSnapshot(
            'main-dashboard-link-button.png',
            'Main dashboard: open Link Website from the Secondary account card',
          ) +
          mainDashboardSnapshot(
            'main-dashboard-link-website.png',
            'Link Website: example store name, platform, origins, and optional URLs',
          ) +
          mainDashboardSnapshot(
            'main-dashboard-api-key.png',
            'Integration Created: copy your own secret API key; the pictured value is only a placeholder',
          ) +
          note(
            'After creation',
            'Creating an integration does not install event sending on your website. Connect your backend using the server guide. If the main UI does not show the webhook signing secret, rotate it under Webhooks in the developer dashboard when configuring your receiver. The screenshot’s Send Test Event button can affect financial records; MyTrackr has no isolated sandbox.',
          ),
      },
      {
        id: 'website-api-sample',
        title: 'Equivalent website API request',
        html:
          p(
            'The main frontend sends <code>POST /integrations</code>. The developer dashboard submits its own form and calls the same creation service. This Bash/cURL example uses a signed-in account’s access token; the normal app session cookie is also supported. Do not use an integration API key to create an integration.',
          ) +
          code(
            'create-website-sample',
            'Bash / cURL — authenticated website creation',
            createIntegrationSample,
          ) +
          p(
            'Replace the example domain with yours. Omit optional URLs until their endpoints exist. Your actual active subscription must include website linking; the older <code>planSlug</code> field is accepted for compatibility but ignored. The response includes <code>publicKey</code>, <code>apiKey</code>, and <code>webhookSigningSecret</code>. Save both secrets immediately; they are shown once.',
          ),
      },
      {
        id: 'sign-in',
        title: '1. Open your developer dashboard',
        html:
          p(
            'Open <a href="/api/dashboard/login">the MyTrackr developer sign-in page</a> and use your verified account’s email and password. You do not need a separate developer account. If you signed up with Google, first set a password through MyTrackr’s account recovery flow.',
          ) +
          note(
            'Website access is required',
            'Open <a href="/api/dashboard/billing">Billing &amp; plans</a>. Your plan must include website linking. Without it, you can read your dashboard, but creation and private API access are unavailable.',
          ),
      },
      {
        id: 'create-integration',
        title: '2. Create an integration for your website',
        html:
          p(
            'In the sidebar, select <strong>Integrations</strong>, then <strong>Create a new integration</strong>. Enter a name you will recognise. Choose React, WordPress, or Custom / other. Use Custom / other for Vue, Flutter, and other platforms.',
          ) +
          p(
            'Enter website origins such as <code>https://shop.example.com</code>, one per line. Do not include paths such as <code>/checkout</code>. Leave the optional webhook URL empty until your receiving endpoint is ready.',
          ) +
          snapshot(
            'snapshot-create-integration.png',
            'Snapshot 1: Where to create your website integration',
            'MyTrackr Integrations page with the Create a new integration form expanded',
          ),
      },
      {
        id: 'save-secrets',
        title: '3. Save both secrets immediately',
        html:
          p(
            'After creation, MyTrackr displays a secret API key and a separate webhook signing secret. Copy them into your server’s secret manager before leaving. The full values are shown only once.',
          ) +
          `<div class="key-comparison"><div><span class="key-tag">Public</span><h3><code>mt_pk_…</code></h3><p>Identifies an integration for public configuration. It cannot authenticate private requests.</p></div><div><span class="key-tag private">Server only</span><h3><code>mt_sk_…</code></h3><p>Authenticates requests from your backend to MyTrackr. Never place it in client code.</p></div><div><span class="key-tag private">Server only</span><h3><code>mt_whsec_…</code></h3><p>Checks that notifications arriving at your webhook endpoint came from MyTrackr.</p></div></div>`,
      },
      {
        id: 'keys-screen',
        title: '4. Return to the API keys screen',
        html:
          p(
            'Select <strong>API keys</strong> in the sidebar, then choose the integration. The public key can be copied here. Only a prefix of the secret API key is displayed.',
          ) +
          snapshot(
            'snapshot-api-keys.png',
            'Snapshot 2: Where to find API keys in MyTrackr',
            'MyTrackr API keys page showing a public key, masked secret key, and password confirmation for rotation',
          ) +
          note(
            'Lost a secret?',
            'Use <strong>Rotate secret API key</strong> on this screen, or rotate the signing secret under <strong>Webhooks</strong>. Confirm your password. Replace the old value on your server immediately; rotation invalidates it.',
          ),
      },
      {
        id: 'next-step',
        title: '5. Pick your platform',
        html:
          p(
            'Start with the server connection, then add your platform’s interface. The API key always stays in the server step.',
          ) +
          architectureDiagram +
          p(
            '<a class="guide-button" href="/developers/guides/server">Set up your backend →</a>',
          ),
      },
    ],
  },
  {
    slug: 'server',
    title: 'Connect your backend to MyTrackr',
    icon: 'server',
    category: 'Start here',
    minutes: 12,
    summary:
      'Build the trusted server connection used by every website and mobile app.',
    related: ['api-keys', 'react', 'vue', 'flutter', 'webhooks'],
    sections: [
      {
        id: 'before-you-start',
        title: '1. Prepare your account and server',
        html:
          prerequisites() +
          architectureDiagram +
          p(
            'The sender below uses Node.js with native <code>fetch</code>. Other backends can send the same HTTPS request using their normal HTTP client.',
          ),
      },
      {
        id: 'server-variables',
        title: '2. Configure server-only variables',
        html:
          p(
            'In your hosting provider’s environment/secret settings, add these values, then restart your backend. Replace the sample origin with your MyTrackr backend’s HTTPS origin. If you use a local .env file, keep it out of source control and load it using your application’s normal environment loader.',
          ) +
          code(
            'server-env',
            'Server environment — never frontend variables',
            'MYTRACKR_API_URL=https://YOUR_MYTRACKR_BACKEND_DOMAIN\nMYTRACKR_API_KEY=YOUR_SECRET_API_KEY',
          ) +
          clientSafety(),
      },
      {
        id: 'send-event',
        title: '3. Add the event sender to your backend',
        html:
          p(
            'Create <code>mytrackr.mjs</code> in your server project. Call this function with an order loaded from your own database after your server has verified its payment. This is a sender helper, not an unauthenticated public route.',
          ) +
          code('server-sender', 'mytrackr.mjs', serverSenderSource) +
          note(
            'Amounts use major currency units',
            '<code>2500</code> means NGN 2,500 when currency is <code>NGN</code>. If your payment provider returns kobo, convert to naira once before sending. Retain your stored order’s authoritative currency and payment timestamp.',
          ),
      },
      {
        id: 'customer-route',
        title: '4. Connect the customer’s request to a trusted order',
        html:
          p(
            'Implement <code>POST /api/orders/:orderId/sync</code> on your own backend for the React, Vue, and Flutter examples. Your application must supply the authentication, order storage, and CSRF protection where cookie sessions are used.',
          ) +
          list(
            'Authenticate the customer using your normal session or bearer token.',
            'Load the order by ID and verify it belongs to that customer.',
            'Verify payment server-side and match the reference, amount, currency, merchant, and order.',
            'Pass the stored order to <code>recordPaidOrder(order)</code>. Do not accept the amount or “paid” status from the client.',
            'Return <code>{ "synced": true, "eventId": result.id }</code> after MyTrackr confirms acceptance. Return an appropriate non-2xx response otherwise.',
          ) +
          note(
            'Prefer automatic server-side syncing',
            'In production, call the sender from your verified payment handler or background job. The client sync button in the platform guides is an optional way to retry a known paid order, not proof of payment.',
          ),
      },
      {
        id: 'verify-result',
        title: '5. Check the result and handle retries',
        html:
          code(
            'server-result',
            'Example MyTrackr response',
            '{\n  "id": "event-uuid",\n  "externalId": "store:1001:paid",\n  "duplicate": false\n}',
          ) +
          p(
            'A repeated external ID is acknowledged with <code>duplicate: true</code>. Keep that ID stable after timeouts. Retry temporary network/5xx failures with bounded backoff; pause on 429 and honour <code>Retry-After</code> when present. Fix 400, 401, and 403 responses rather than retrying indefinitely.',
          ) +
          commonChecks(),
      },
    ],
  },
  {
    slug: 'react',
    title: 'Connect a React website',
    icon: 'react',
    category: 'Platforms',
    minutes: 10,
    summary:
      'Add a React interface that safely talks to your backend and tracks verified orders.',
    related: ['server', 'api-keys', 'paystack'],
    sources: [
      {
        title: 'React: responding to events',
        url: 'https://react.dev/learn/responding-to-events',
      },
    ],
    sections: [
      {
        id: 'prepare',
        title: '1. Set up the server connection first',
        html:
          prerequisites() +
          p(
            'Complete <a href="/developers/guides/server">the backend guide</a> before adding this component. It defines the customer-authenticated <code>/api/orders/:orderId/sync</code> route used below.',
          ) +
          architectureDiagram +
          clientSafety(),
      },
      {
        id: 'register',
        title: '2. Register your React website',
        html:
          p(
            'In <a href="/api/dashboard/integrations">Integrations</a>, select React and add the origins used by your deployed website. Keep production origins HTTPS. Add each required subdomain explicitly; do not use wildcard examples.',
          ) +
          snapshot(
            'snapshot-create-integration.png',
            'Snapshot: Register your React website in Integrations',
            'MyTrackr integration form showing name, platform, and allowed-origin fields',
          ),
      },
      {
        id: 'component',
        title: '3. Add the sync component',
        html:
          p(
            'Create the file below. Pass the paid order ID and a CSRF token issued by your own backend. If your API is on a different origin, adapt its URL, CORS policy, and customer authentication to your application.',
          ) +
          code('react-component', 'src/components/SyncOrder.jsx', reactSource) +
          code(
            'react-use',
            'Use on your existing order confirmation page',
            '<SyncOrder orderId={order.id} csrfToken={session.csrfToken} />',
          ),
      },
      {
        id: 'check',
        title: '4. Verify the order appears in MyTrackr',
        html:
          commonChecks() +
          note(
            'A payment popup is not confirmation',
            'If you use Paystack, let your backend verify the transaction before it sends an event. Read <a href="/developers/guides/paystack">the Paystack keys and verification guide</a> for the separate payment credentials.',
          ),
      },
    ],
  },
  {
    slug: 'vue',
    title: 'Connect a Vue website',
    icon: 'vue',
    category: 'Platforms',
    minutes: 10,
    summary:
      'Use a Vue component with your authenticated backend—without exposing secret keys.',
    related: ['server', 'api-keys', 'paystack'],
    sources: [
      {
        title: 'Vue: event handling',
        url: 'https://vuejs.org/guide/essentials/event-handling.html',
      },
    ],
    sections: [
      {
        id: 'prepare',
        title: '1. Prepare your backend',
        html:
          prerequisites() +
          p(
            'Complete <a href="/developers/guides/server">the shared backend guide</a>. Your Vue app calls your own backend; your backend sends the event to MyTrackr.',
          ) +
          architectureDiagram +
          clientSafety(),
      },
      {
        id: 'register',
        title: '2. Create a Custom / other integration',
        html:
          p(
            'Open Integrations, choose <strong>Custom / other</strong>, and add your Vue website’s HTTPS origins. Vue uses the same event API as other platforms; no MyTrackr Vue package is required.',
          ) +
          snapshot(
            'snapshot-create-integration.png',
            'Snapshot: Use Custom / other for Vue',
            'Integration form with a platform dropdown and allowed website origins',
          ),
      },
      {
        id: 'component',
        title: '3. Add a Vue single-file component',
        html:
          p(
            'Create <code>SyncOrder.vue</code>. Supply the customer’s order ID and your backend’s CSRF token. The endpoint below is part of your own application, as defined in the backend guide.',
          ) +
          code('vue-component', 'src/components/SyncOrder.vue', vueSource) +
          code(
            'vue-use',
            'Use on your order confirmation page',
            '<SyncOrder :order-id="order.id" :csrf-token="session.csrfToken" />',
          ),
      },
      {
        id: 'check',
        title: '4. Check your event history',
        html: commonChecks(),
      },
    ],
  },
  {
    slug: 'flutter',
    title: 'Connect a Flutter app',
    icon: 'flutter',
    category: 'Platforms',
    minutes: 12,
    summary:
      'Connect mobile or Flutter web through your own backend, with clear credential boundaries.',
    related: ['server', 'api-keys', 'paystack'],
    sources: [
      {
        title: 'Flutter: send data to the internet',
        url: 'https://docs.flutter.dev/cookbook/networking/send-data',
      },
    ],
    sections: [
      {
        id: 'prepare',
        title: '1. Connect your backend and register the app',
        html:
          prerequisites() +
          p(
            'Choose <strong>Custom / other</strong> when creating the MyTrackr integration. Native mobile apps do not have a browser origin; for Flutter web, configure the deployed website’s origins. An empty origin list does not make a secret key safe to ship.',
          ) +
          architectureDiagram +
          clientSafety(),
      },
      {
        id: 'dependency',
        title: '2. Add the HTTP client',
        html:
          p(
            'From your Flutter project folder, run the command below. Your app must already have its own customer sign-in flow. Use that customer’s access token for your backend; it is not the MyTrackr secret API key.',
          ) +
          code(
            'flutter-dependency',
            'Terminal — Flutter project folder',
            'flutter pub add http',
          ) +
          p(
            'Allow internet access in your Android application manifest when needed. For Flutter web, configure your backend to allow your website origin and its customer-authentication headers.',
          ),
      },
      {
        id: 'sender',
        title: '3. Add the app’s backend request',
        html:
          p(
            'Create the service file below. Replace <code>your-backend.example.com</code> with your application backend’s domain, and implement the route using <a href="/developers/guides/server#customer-route">the server guide’s contract</a>.',
          ) +
          code(
            'flutter-service',
            'lib/services/mytrackr_sync.dart',
            flutterSource,
          ) +
          p(
            'Call <code>syncPaidOrder</code> from your existing order screen. Disable the button while it runs. Show success only after it completes; catch errors and offer a retry for the same order. Check <code>mounted</code> before updating a widget after an await.',
          ),
      },
      {
        id: 'check',
        title: '4. Confirm the event from the dashboard',
        html:
          snapshot(
            'snapshot-api-keys.png',
            'Snapshot: Your keys stay in the dashboard and on your backend',
            'MyTrackr keys page with the secret key masked',
          ) +
          commonChecks() +
          note(
            'No secret in the app bundle',
            'Build-time variables, obfuscation, and device storage do not turn a shared merchant API key into a safe mobile credential. Keep it on the backend even for release builds.',
          ),
      },
    ],
  },
  {
    slug: 'wordpress',
    title: 'Connect WordPress and WooCommerce',
    icon: 'wordpress',
    category: 'Platforms',
    minutes: 15,
    summary:
      'Send paid WooCommerce orders from your WordPress server using a small custom plugin.',
    related: ['api-keys', 'webhooks', 'go-live'],
    sources: [
      {
        title: 'WordPress HTTP API',
        url: 'https://developer.wordpress.org/plugins/http-api/',
      },
      {
        title: 'WooCommerce order reference',
        url: 'https://woocommerce.github.io/code-reference/classes/WC-Order.html#method_payment_complete',
      },
    ],
    sections: [
      {
        id: 'prepare',
        title: '1. Prepare WordPress and your integration',
        html:
          prerequisites() +
          p(
            'You need administrator or hosting access to a WordPress site with WooCommerce installed. Create an integration with the WordPress platform selected. This guide uses a custom plugin; it does not require or claim an official MyTrackr WordPress plugin.',
          ) +
          clientSafety(),
      },
      {
        id: 'settings',
        title: '2. Save server credentials in wp-config.php',
        html:
          p(
            'Using your host’s secure file editor or deployment process, add these constants before the “stop editing” line in <code>wp-config.php</code>. Replace both placeholders. Keep this file private and make a backup before editing.',
          ) +
          code(
            'wp-config',
            'wp-config.php — server only',
            "define('MYTRACKR_API_URL', 'https://YOUR_MYTRACKR_BACKEND_DOMAIN');\ndefine('MYTRACKR_API_KEY', 'YOUR_SECRET_API_KEY');",
          ),
      },
      {
        id: 'plugin',
        title: '3. Add a custom payment-complete plugin',
        html:
          p(
            'Create <code>wp-content/plugins/mytrackr-orders/mytrackr-orders.php</code>, paste the example below, and activate <strong>MyTrackr Order Connection</strong> from WordPress → Plugins. Test this on a separate business first. The plugin retries temporary failures three times through WordPress scheduled events; your host must run WP-Cron reliably.',
          ) +
          code(
            'wp-plugin',
            'mytrackr-orders.php',
            `<?php
/** Plugin Name: MyTrackr Order Connection */
defined('ABSPATH') || exit;
add_action('woocommerce_payment_complete', 'mytrackr_send_order', 10, 1);
add_action('mytrackr_retry_order', 'mytrackr_send_order', 10, 2);

function mytrackr_send_order($order_id, $attempt = 0) {
  if (!defined('MYTRACKR_API_URL') || !defined('MYTRACKR_API_KEY')) return;
  $order = wc_get_order($order_id);
  if (!$order || !$order->is_paid() || !$order->get_date_paid()) return;
  if ($order->get_meta('_mytrackr_event_sent')) return;
  $origin = rtrim(MYTRACKR_API_URL, '/');
  if (wp_parse_url($origin, PHP_URL_SCHEME) !== 'https') return;
  $response = wp_remote_post($origin . '/integrations/events', [
    'timeout' => 10, 'redirection' => 0,
    'headers' => [
      'Content-Type' => 'application/json',
      'x-mytrackr-api-key' => MYTRACKR_API_KEY,
    ],
    'body' => wp_json_encode([
      'event' => 'order.paid',
      'externalId' => 'woo:' . $order_id . ':paid',
      'orderId' => (string) $order_id,
      'amount' => (float) $order->get_total(),
      'currency' => $order->get_currency(),
      'occurredAt' => $order->get_date_paid()->format(DATE_ATOM),
    ]),
  ]);
  $status = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
  $body = is_wp_error($response) ? null : json_decode(wp_remote_retrieve_body($response), true);
  if ($status >= 200 && $status < 300 && !empty($body['id'])) {
    $order->update_meta_data('_mytrackr_event_sent', $body['id']);
    $order->save();
  } elseif (($status === 0 || $status === 429 || $status >= 500) && $attempt < 3) {
    wp_schedule_single_event(time() + 60 * (2 ** $attempt),
      'mytrackr_retry_order', [$order_id, $attempt + 1]);
  } else {
    $order->add_order_note('MyTrackr sync needs review. HTTP status: ' . $status);
  }
}`,
          ),
      },
      {
        id: 'check',
        title: '4. Confirm the order and review failures',
        html:
          commonChecks() +
          note(
            'Start with paid orders',
            'This example sends new payment-complete events only. It does not backfill historical orders or send refunds automatically. Add separate, verified refund handling with a unique refund event ID if your store needs it.',
          ),
      },
    ],
  },
  {
    slug: 'paystack',
    title: 'Find and use your Paystack API keys — with snapshots',
    icon: 'paystack',
    category: 'Payments',
    minutes: 8,
    summary:
      'Follow the illustrated credential path, choose the right key, and verify payments before syncing.',
    related: ['api-keys', 'server', 'go-live'],
    sources: [
      {
        title: 'Paystack: API keys',
        url: 'https://paystack.com/docs/developer-tools/api-keys/',
      },
      {
        title: 'Paystack Support: keys and webhooks',
        url: 'https://support.paystack.com/en/articles/2123458',
      },
      {
        title: 'Paystack: verify payments',
        url: 'https://paystack.com/docs/payments/verify-payments/',
      },
    ],
    sections: [
      {
        id: 'two-services',
        title: '1. Know which service each key belongs to',
        html:
          p(
            'Your MyTrackr API key sends financial events to MyTrackr. Your Paystack keys belong to your merchant payment account. Copy each value from its own dashboard, and keep the environment variables separate.',
          ) +
          `<div class="key-comparison"><div><span class="key-tag">MyTrackr</span><h3><code>mt_sk_…</code></h3><p>Your backend sends verified events to <code>/integrations/events</code>.</p></div><div><span class="key-tag">Paystack public</span><h3><code>pk_test_… / pk_live_…</code></h3><p>Your payment interface uses the public payment key.</p></div><div><span class="key-tag private">Paystack secret</span><h3><code>sk_test_… / sk_live_…</code></h3><p>Your backend verifies payment with Paystack.</p></div></div>`,
      },
      {
        id: 'find-keys',
        title: '2. Locate the keys in Paystack',
        html:
          p(
            'Sign in at <a href="https://dashboard.paystack.com/" target="_blank" rel="noopener noreferrer">Paystack Dashboard</a>. Look under <strong>Developers</strong> for the API configuration. On the classic dashboard, open <strong>Settings → API Keys &amp; Webhooks</strong>. Select the environment you need. Reveal or copy the required key using your account permissions and password when prompted.',
          ) +
          `<figure class="snapshot illustrated"><div class="snapshot-bar"><span></span><span></span><span></span><b>Paystack · Illustrated navigation snapshot</b></div><div class="paystack-illustration"><aside><b>Paystack</b><span>Overview</span><span>Transactions</span><strong>① Developers</strong><span>API configuration</span></aside><div><p class="eyebrow">② API configuration</p><h3>Your API keys</h3><div class="mode-choice"><b>Test mode</b><span>Live mode</span></div><label>③ Public key <code>pk_test_••••••••••••••••</code></label><label>④ Secret key <code>sk_test_••••••••••••••••</code></label><small>Secrets stay on your server</small></div></div><figcaption><b>Illustrated snapshot: where to find Paystack credentials</b><span>Navigation aid, not a screenshot of a signed-in Paystack account. Labels vary between dashboard versions; use the official links below if your screen differs.</span></figcaption></figure>`,
      },
      {
        id: 'connect-in-mytrackr',
        title: 'Connect Paystack in the main MyTrackr dashboard',
        html:
          p(
            'For direct merchant sync, sign in to <a href="https://dashboard.mytrackrservices.com/dashboard">the main MyTrackr dashboard</a>, select <strong>Link Website</strong> on the Secondary account card, then choose the <strong>Payment Gateway</strong> tab. Paste your merchant <strong>Paystack Secret Key</strong> and select <strong>Connect Paystack</strong>. MyTrackr stores the key encrypted and does not return the full value.',
          ) +
          mainDashboardSnapshot(
            'main-dashboard-paystack.png',
            'Payment Gateway: connect your merchant Paystack secret key',
          ) +
          p(
            'This form calls <code>POST /integrations/paystack/connect</code>. It requires a signed-in account with Paystack linking access. This is separate from creating a website integration. Website integration creation is available in either dashboard; the developer dashboard currently has no merchant Paystack connection form.',
          ) +
          code(
            'connect-paystack-sample',
            'Bash / cURL — direct merchant connection',
            connectPaystackSample,
          ) +
          p(
            'Set <code>MYTRACKR_ACCESS_TOKEN</code> to your account access token and <code>PAYSTACK_SECRET_KEY</code> to your merchant secret in your private shell environment. An app session cookie can also authenticate the request. Do not send a MyTrackr integration API key as the Paystack secret.',
          ) +
          code(
            'sync-paystack-sample',
            'Bash / cURL — request a direct sync after connecting',
            'curl -X POST "https://api.mytrackrservices.com/integrations/paystack/sync" \\\n  -H "Authorization: Bearer $MYTRACKR_ACCESS_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data \'{}\'',
          ) +
          note(
            'Choose how each sale reaches MyTrackr',
            'Connecting a key and requesting sync are separate operations. Avoid also sending the same sales through website events without reconciling the two paths. Do not assume creating a website integration starts Paystack imports.',
          ),
      },
      {
        id: 'environments',
        title: '3. Keep test and live credentials separate',
        html:
          p(
            'Paystack test keys exercise payment flows without live charges. Live payment access depends on business activation. Use the matching key pair for your payment environment. MyTrackr itself has no isolated integration sandbox, so keep development events in a separate test business.',
          ) +
          code(
            'paystack-env',
            'Your backend secret settings',
            'MYTRACKR_API_KEY=YOUR_MYTRACKR_SECRET\nPAYSTACK_SECRET_KEY=YOUR_PAYSTACK_SECRET\n# Paystack public keys may be used by the payment UI.\n# Secret keys stay on this server.',
          ) +
          note(
            'A Paystack key is not a MyTrackr key',
            'Do not paste <code>sk_live_…</code> into the MyTrackr <code>x-mytrackr-api-key</code> header. Use <code>mt_sk_…</code> there. Treat webhook signing secrets as a third, separate credential.',
          ),
      },
      {
        id: 'verify-payment',
        title: '4. Verify payment on your backend',
        html:
          p(
            'Treat a browser callback as a request to check payment, not as proof it succeeded. Your backend checks the transaction reference with Paystack, confirms a successful result, matches the stored order’s amount and currency, and marks that order paid before calling the MyTrackr sender.',
          ) +
          code(
            'paystack-verify',
            'Server-side verification request',
            'curl "https://api.paystack.co/transaction/verify/YOUR_REFERENCE" \\\n  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY"',
          ) +
          p(
            'Use the returned verified payment date and your stored order total. See <a href="/developers/guides/server">the backend guide</a> for the MyTrackr event sender.',
          ),
      },
      {
        id: 'avoid-duplicates',
        title: '5. Choose a single recording path',
        html:
          note(
            'Avoid counting the same sale twice',
            'If you already import Paystack transactions directly into MyTrackr through the application’s Paystack connection, do not also send the same sales as website events without a reconciliation strategy. These paths use different external IDs.',
          ) +
          p(
            'MyTrackr webhook signatures and Paystack webhook signatures are different schemes. Follow each provider’s own verification documentation. Never use a MyTrackr signing secret to verify a Paystack notification.',
          ),
      },
    ],
  },
  {
    slug: 'webhooks',
    title: 'Receive and verify MyTrackr webhooks',
    icon: 'webhook',
    category: 'Go live',
    minutes: 10,
    summary:
      'Configure your endpoint, verify signed notifications, and understand delivery retries.',
    related: ['api-keys', 'server', 'go-live'],
    sections: [
      {
        id: 'choose-direction',
        title: '1. Understand the direction',
        html:
          p(
            'An <strong>event</strong> travels from your server to MyTrackr. A <strong>webhook</strong> travels from MyTrackr to your server. You can send order events without configuring a webhook endpoint.',
          ) + architectureDiagram,
      },
      {
        id: 'endpoint',
        title: '2. Add your receiving endpoint',
        html:
          p(
            'Build a public HTTPS endpoint on your backend, for example <code>https://shop.example.com/webhooks/mytrackr</code>. In MyTrackr, open <strong>Integrations → Settings</strong> and save that URL. It must use public HTTPS on port 443; private-network addresses and redirects are rejected.',
          ) +
          p(
            'Save your integration’s <code>mt_whsec_…</code> signing secret on the receiving server. If it was not saved, rotate it from the Webhooks screen and update the receiver immediately.',
          ),
      },
      {
        id: 'signature',
        title: '3. Verify the exact raw request body',
        html:
          p(
            'Keep the incoming body as bytes until after signature verification. Re-serialising parsed JSON can change those bytes. Compare the signature using a constant-time comparison before accepting the notification.',
          ) +
          code(
            'webhook-check',
            'verify-mytrackr.mjs — receiving server',
            `import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMyTrackr(rawBody, signature) {
  const secret = process.env.MYTRACKR_WEBHOOK_SIGNING_SECRET;
  if (!secret || typeof signature !== 'string' || signature.length !== 71) return false;
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(rawBody).digest('hex');
  const received = Buffer.from(signature);
  const correct = Buffer.from(expected);
  return received.length === correct.length && timingSafeEqual(received, correct);
}`,
          ),
      },
      {
        id: 'deduplicate',
        title: '4. Store the delivery ID before applying changes',
        html:
          p(
            'After validating the signature, check <code>x-mytrackr-delivery-id</code> against a durable deduplication store with a unique constraint. Apply business changes and mark the delivery processed atomically. A repeated delivery should receive a successful response without applying the change again.',
          ) +
          note(
            'Signed notifications can still be replayed',
            'Valid signatures prove origin; they do not make a delivery unique. A retry keeps its original ID and body. Use the delivery ID as the deduplication key, not the event timestamp.',
          ),
      },
      {
        id: 'retry',
        title: '5. Review and retry failed deliveries',
        html: p(
          'Open <a href="/api/dashboard/webhooks">Dashboard → Webhooks</a>. Failed deliveries with fewer than five retries can be retried for an enabled integration, and only to its current endpoint. A signing-secret rotation also applies to retried deliveries. There is no automatic retry scheduler in this dashboard.',
        ),
      },
    ],
  },
  {
    slug: 'go-live',
    title: 'Check your connection before launch',
    icon: 'check',
    category: 'Go live',
    minutes: 5,
    summary:
      'A practical checklist for credentials, order accuracy, error recovery, and launch-day checks.',
    related: ['server', 'webhooks', 'paystack'],
    sections: [
      {
        id: 'credentials',
        title: '1. Check credentials and subscription',
        html: list(
          'Confirm your production business has an active website-linking plan.',
          'Keep your MyTrackr secret, Paystack secret, and webhook signing secret in separate server variables.',
          'Remove sample credentials and rotate any secret copied into source control or a public page.',
          'Use HTTPS for production sites and receiving endpoints. Add exact website origins.',
        ),
      },
      {
        id: 'accuracy',
        title: '2. Check that money is recorded once',
        html: list(
          'Confirm the amount is in major units and the currency matches the verified order.',
          'Use a stable external ID and submit the same event twice to confirm <code>duplicate: true</code>. Do this only in a separate test business.',
          'Do not record the same sale through both event ingestion and direct Paystack imports unless your reconciliation logic handles it.',
          'Verify at least one known payment end-to-end and compare its reference in Events with your order database.',
        ),
      },
      {
        id: 'failures',
        title: '3. Walk through failure cases',
        html: `<div class="table-wrap"><table><thead><tr><th>Response</th><th>What to check</th></tr></thead><tbody><tr><td>400</td><td>Event fields, timestamp, numeric amounts, and origin settings.</td></tr><tr><td>401</td><td>The integration API-key header is present.</td></tr><tr><td>403</td><td>Key correctness, revoked integration, account status, and subscription expiry.</td></tr><tr><td>429</td><td>Wait, honour Retry-After when present, and use bounded backoff.</td></tr><tr><td>Timeout / 5xx</td><td>Retry the same external ID; never generate a new ID just because the response was lost.</td></tr></tbody></table></div>`,
      },
      {
        id: 'launch',
        title: '4. Monitor the first real orders',
        html:
          p(
            'Use the developer dashboard to check accepted events and webhook delivery status. Keep a support process for expired subscriptions, revoked keys, and repeated failures. The dashboard shows accepted integration events—not a complete log of every rejected HTTP request.',
          ) +
          p(
            '<a class="guide-button" href="/api/dashboard">Open your dashboard →</a>',
          ),
      },
    ],
  },
];
