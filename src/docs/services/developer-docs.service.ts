import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

type DocStep = {
  title: string;
  body: string;
};

type DocEndpoint = {
  method: string;
  path: string;
  auth: string;
  summary: string;
  notes?: string[];
  requestExample?: string;
  responseExample?: string;
};

type DocCodeExample = {
  title: string;
  language: string;
  code: string;
};

type WebhookHeader = {
  name: string;
  description: string;
};

@Injectable()
export class DeveloperDocsService {
  private readonly template = Handlebars.compile(
    readFileSync(
      join(__dirname, '..', 'templates', 'integrations.hbs'),
      'utf8',
    ),
  );

  renderIntegrationsPage(baseUrl: string) {
    const endpoints = this.getEndpoints();

    return this.template({
      title: 'MyTrackr Integrations Guide',
      description:
        'Server-side integration guide for developers building with MyTrackr website integrations.',
      baseUrl,
      swaggerUrl: `${baseUrl}/swagger`,
      swaggerJsonUrl: `${baseUrl}/swagger-json`,
      steps: this.getSteps(),
      prerequisites: [
        'The business owner must have an active Web or Unlimited subscription.',
        'Create the integration while authenticated with the normal app session cookie.',
        'Store the returned apiKey immediately. It is shown once.',
        'Use x-mytrackr-api-key for server-to-server requests after creation.',
      ],
      endpointGroups: [
        {
          id: 'setup-endpoints',
          title: 'Setup',
          endpoints: endpoints.slice(0, 4),
        },
        {
          id: 'runtime-endpoints',
          title: 'Runtime',
          endpoints: endpoints.slice(4, 9),
        },
      ],
      codeExamples: this.getCodeExamples(baseUrl),
      eventTypes: [
        'order.paid',
        'order.refunded',
        'order.cancelled',
        'payment.failed',
      ],
      webhookEvents: [
        'integration.created',
        'integration.updated',
        'integration.revoked',
        'integration.event.received',
        'integration.paystack.connected',
        'integration.paystack.disconnected',
        'integration.paystack.sync.completed',
        'integration.paystack.sync.failed',
      ],
      webhookHeaders: this.getWebhookHeaders(),
      webhookPayloadExample: this.getWebhookPayloadExample(),
      webhookVerificationExample: this.getWebhookVerificationExample(),
    });
  }

  private getSteps(): DocStep[] {
    return [
      {
        title: '1. Subscribe to the right plan',
        body: 'Website integrations only work for accounts on the Web or Unlimited plan.',
      },
      {
        title: '2. Create the integration',
        body: 'Call POST /integrations while logged into the app. The response returns publicKey, apiKey, and integration metadata.',
      },
      {
        title: '3. Embed or connect your site',
        body: 'Use the public config endpoint in browser-facing code and the private config endpoint in server-side code.',
      },
      {
        title: '4. Send ecommerce events',
        body: 'Post order and payment events from your backend using x-mytrackr-api-key.',
      },
      {
        title: '5. Read metrics and optional Paystack sync',
        body: 'Fetch aggregated metrics from the private metrics endpoint and optionally connect a merchant Paystack account for direct sync.',
      },
    ];
  }

  private getEndpoints(): DocEndpoint[] {
    return [
      {
        method: 'POST',
        path: '/integrations',
        auth: 'Session cookie',
        summary: 'Create a website integration and receive an API key.',
        notes: [
          'Requires an active Web or Unlimited subscription.',
          'planSlug is deprecated and should be omitted.',
          'The apiKey is shown once and should be stored securely.',
        ],
        requestExample: this.json({
          name: 'Main website',
          platform: 'react',
          allowedOrigins: ['https://shop.example.com'],
          redirectUrl: 'https://shop.example.com/mytrackr/callback',
          webhookUrl: 'https://shop.example.com/api/mytrackr/webhook',
        }),
        responseExample: this.json({
          id: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
          name: 'Main website',
          platform: 'react',
          publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
          apiKeyPrefix: 'mt_sk_2f22d4cf5',
          apiKey:
            'mt_sk_2f22d4cf56c56e2f7d63179c4890c4ef6f775f7bfb1f7d3848bc21c84f31ab10',
          billingStatus: 'active',
          currentPeriodEnd: '2026-07-14T00:00:00.000Z',
          allowedOrigins: ['https://shop.example.com'],
          redirectUrl: 'https://shop.example.com/mytrackr/callback',
          webhookUrl: 'https://shop.example.com/api/mytrackr/webhook',
          connectUrl: 'https://api.mytrackr.app/integrations/connect?client=mt_pk_xxx',
          isActive: true,
          createdAt: '2026-06-14T09:12:31.221Z',
          updatedAt: '2026-06-14T09:12:31.221Z',
        }),
      },
      {
        method: 'GET',
        path: '/integrations',
        auth: 'Session cookie',
        summary: 'List integrations for the authenticated user.',
        requestExample: this.json({
          note: 'No request body. Send the authenticated session cookie.',
        }),
        responseExample: this.json([
          {
            id: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
            name: 'Main website',
            platform: 'react',
            publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
            apiKeyPrefix: 'mt_sk_2f22d4cf5',
            billingStatus: 'active',
            currentPeriodEnd: '2026-07-14T00:00:00.000Z',
            allowedOrigins: ['https://shop.example.com'],
            connectUrl: 'https://api.mytrackr.app/integrations/connect?client=mt_pk_xxx',
            isActive: true,
            createdAt: '2026-06-14T09:12:31.221Z',
            updatedAt: '2026-06-14T09:12:31.221Z',
          },
        ]),
      },
      {
        method: 'GET',
        path: '/integrations/public/:publicKey/config',
        auth: 'Public',
        summary: 'Fetch browser-safe configuration for embeds.',
        notes: ['Optionally send the Origin header when allowedOrigins is configured.'],
        requestExample: this.json({
          params: {
            publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
          },
          headers: {
            origin: 'https://shop.example.com',
          },
        }),
        responseExample: this.json({
          publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
          name: 'Main website',
          platform: 'react',
          businessName: 'Acme Stores',
          connectUrl: 'https://api.mytrackr.app/integrations/connect?client=mt_pk_xxx',
          allowedOrigins: ['https://shop.example.com'],
          features: {
            pricing: true,
            accountLinking: true,
            ocrUpload: true,
          },
          billingStatus: 'active',
        }),
      },
      {
        method: 'GET',
        path: '/integrations/private/config',
        auth: 'x-mytrackr-api-key',
        summary: 'Fetch private integration config for server-side plugins.',
        requestExample: this.json({
          headers: {
            'x-mytrackr-api-key': 'mt_sk_your_secret_key',
          },
        }),
        responseExample: this.json({
          integration: {
            id: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
            name: 'Main website',
            platform: 'react',
            publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
            apiKeyPrefix: 'mt_sk_2f22d4cf5',
            billingStatus: 'active',
            allowedOrigins: ['https://shop.example.com'],
            connectUrl: 'https://api.mytrackr.app/integrations/connect?client=mt_pk_xxx',
            isActive: true,
          },
          business: {
            id: '3c6eb988-ec8f-4d08-8dc5-ef7d2a38f108',
            name: 'Acme Stores',
            currency: 'NGN',
          },
          plans: [
            {
              id: '1e703f4f-fae0-4094-970c-75c2289a3ec0',
              name: 'Starter',
              slug: 'starter',
              price: 500,
              currency: 'NGN',
              interval: 'monthly',
            },
            {
              id: '6e8fd5c1-d97a-4ddd-97cb-6c4557fd4d1c',
              name: 'Unlimited',
              slug: 'unlimited',
              price: 5500,
              currency: 'NGN',
              interval: 'monthly',
            },
          ],
        }),
      },
      {
        method: 'POST',
        path: '/integrations/events',
        auth: 'x-mytrackr-api-key',
        summary: 'Send ecommerce order and payment events from your backend.',
        notes: ['externalId is deduplicated per integration. Resending the same externalId returns duplicate=true.'],
        requestExample: this.json({
          event: 'order.paid',
          externalId: 'woo_order_12345',
          orderId: 'order_12345',
          amount: 25000,
          currency: 'NGN',
          taxAmount: 1875,
          paymentFee: 375,
          paymentProvider: 'paystack',
          occurredAt: '2026-06-14T10:30:00.000Z',
          customer: {
            email: 'customer@example.com',
            name: 'Ada Customer',
          },
          items: [
            {
              productId: 'sku_123',
              name: 'Product A',
              category: 'Accessories',
              quantity: 2,
              unitPrice: 12500,
              total: 25000,
            },
          ],
          metadata: {
            source: 'woocommerce',
          },
        }),
        responseExample: this.json({
          id: '8b8109a2-2712-4f5d-9a78-cfbb97212d75',
          externalId: 'woo_order_12345',
          duplicate: false,
        }),
      },
      {
        method: 'GET',
        path: '/integrations/private/metrics',
        auth: 'x-mytrackr-api-key',
        summary: 'Read aggregated ecommerce metrics for a date range.',
        requestExample: this.json({
          headers: {
            'x-mytrackr-api-key': 'mt_sk_your_secret_key',
          },
          query: {
            startDate: '2026-06-01',
            endDate: '2026-06-30',
          },
        }),
        responseExample: this.json({
          period: {
            start: '2026-06-01T00:00:00.000Z',
            end: '2026-06-30T23:59:59.999Z',
          },
          grossSales: 250000,
          successfulPaymentInflow: 250000,
          refunds: 10000,
          netSales: 236250,
          orderCount: 10,
          averageOrderValue: 25000,
          revenueByDay: [{ period: '2026-06-14', revenue: 25000, orders: 1 }],
          revenueByWeek: [{ period: '2026-W24', revenue: 125000, orders: 5 }],
          revenueByMonth: [{ period: '2026-06', revenue: 250000, orders: 10 }],
          revenueByProduct: [
            { productId: 'sku_123', name: 'Product A', revenue: 25000, quantity: 2 },
          ],
          revenueByCategory: [
            { category: 'Accessories', revenue: 25000, quantity: 2 },
          ],
          customerCount: 8,
          repeatCustomerCount: 2,
          failedPayments: { count: 2, amount: 15000 },
          taxableSales: 18750,
          paymentFees: 3750,
        }),
      },
      {
        method: 'POST',
        path: '/integrations/paystack/connect',
        auth: 'x-mytrackr-api-key',
        summary: 'Store a merchant Paystack secret key for direct sync.',
        requestExample: this.json({
          secretKey: 'sk_live_xxx',
        }),
        responseExample: this.json({
          id: 'cad65b2c-d876-462d-9f31-a3cc680fef98',
          integrationId: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
          keyPreview: 'sk_live_xxx',
          businessName: 'Acme Stores',
          businessEmail: 'owner@example.com',
          country: 'NG',
          isActive: true,
          createdAt: '2026-06-14T10:15:12.000Z',
          updatedAt: '2026-06-14T10:15:12.000Z',
        }),
      },
      {
        method: 'POST',
        path: '/integrations/paystack/sync',
        auth: 'x-mytrackr-api-key',
        summary: 'Fetch Paystack transactions and import inflow metrics.',
        requestExample: this.json({
          startDate: '2026-06-01',
          endDate: '2026-06-30',
        }),
        responseExample: this.json({
          imported: 25,
          skipped: 3,
          fetched: 28,
          fetchedTransactions: 26,
          fetchedRefunds: 2,
          connection: {
            id: 'cad65b2c-d876-462d-9f31-a3cc680fef98',
            integrationId: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
            keyPreview: 'sk_live_xxx',
            isActive: true,
            lastSyncedAt: '2026-06-14T10:31:22.000Z',
            lastSuccessfulSyncAt: '2026-06-14T10:31:22.000Z',
            createdAt: '2026-06-14T10:15:12.000Z',
            updatedAt: '2026-06-14T10:31:22.000Z',
          },
        }),
      },
      {
        method: 'POST',
        path: '/integrations/:id/rotate-key',
        auth: 'Session cookie',
        summary: 'Rotate the secret API key for an active integration.',
        requestExample: this.json({
          params: {
            id: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
          },
          note: 'No request body. Send the authenticated session cookie.',
        }),
        responseExample: this.json({
          id: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
          name: 'Main website',
          platform: 'react',
          publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
          apiKeyPrefix: 'mt_sk_4e882f5ab',
          apiKey:
            'mt_sk_4e882f5ab1f48248c6f8ab7f271f96cbce91ef7c55ed3ff6196406d58b7bdcda',
          billingStatus: 'active',
          isActive: true,
          updatedAt: '2026-06-14T10:48:05.000Z',
        }),
      },
    ];
  }

  private getCodeExamples(baseUrl: string): DocCodeExample[] {
    return [
      {
        title: 'Create an integration with a logged-in session',
        language: 'bash',
        code: `curl -X POST "${baseUrl}/integrations" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: accessToken=YOUR_SESSION_COOKIE" \\
  -d '{
    "name": "Main website",
    "platform": "react",
    "allowedOrigins": ["https://shop.example.com"],
    "redirectUrl": "https://shop.example.com/mytrackr/callback"
  }'`,
      },
      {
        title: 'Send an order.paid event from your backend',
        language: 'bash',
        code: `curl -X POST "${baseUrl}/integrations/events" \\
  -H "Content-Type: application/json" \\
  -H "x-mytrackr-api-key: mt_sk_your_secret_key" \\
  -d '{
    "event": "order.paid",
    "externalId": "woo_order_12345",
    "orderId": "order_12345",
    "amount": 25000,
    "currency": "NGN",
    "occurredAt": "2026-06-14T10:30:00.000Z"
  }'`,
      },
      {
        title: 'Fetch private config in Node.js',
        language: 'js',
        code: `const response = await fetch("${baseUrl}/integrations/private/config", {
  headers: {
    "x-mytrackr-api-key": process.env.MYTRACKR_API_KEY,
  },
});

if (!response.ok) {
  throw new Error(\`MyTrackr request failed: \${response.status}\`);
}

const data = await response.json();
console.log(data.business.name);`,
      },
      {
        title: 'Verify MyTrackr webhook signatures in Node.js',
        language: 'js',
        code: `import crypto from "crypto";

export function verifyMyTrackrWebhook(rawBody, signatureHeader) {
  const secret = process.env.INTEGRATION_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) {
    return false;
  }

  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}`,
      },
    ];
  }

  private getWebhookHeaders(): WebhookHeader[] {
    return [
      {
        name: 'x-mytrackr-event',
        description: 'The outbound webhook event name.',
      },
      {
        name: 'x-mytrackr-delivery-id',
        description: 'Unique delivery identifier for deduplication and troubleshooting.',
      },
      {
        name: 'x-mytrackr-timestamp',
        description: 'ISO timestamp for when MyTrackr created the delivery.',
      },
      {
        name: 'x-mytrackr-signature',
        description:
          'Present when INTEGRATION_WEBHOOK_SECRET is configured. Format: sha256=<hmac of raw JSON body>.',
      },
    ];
  }

  private getWebhookPayloadExample() {
    return this.json({
      id: '1e1d59f7-3e2a-4ac8-bf09-2e95d2ad4d8f',
      event: 'integration.event.received',
      createdAt: '2026-06-14T10:30:00.000Z',
      integration: {
        id: 'ff77a8db-cf6c-4f58-b9d0-2c6a7f9c2011',
        name: 'Main website',
        platform: 'react',
        publicKey: 'mt_pk_7f7dfab2485e51dc15f94be5fb6681cb',
        webhookUrl: 'https://shop.example.com/api/mytrackr/webhook',
        redirectUrl: 'https://shop.example.com/mytrackr/callback',
        billingStatus: 'active',
        isActive: true,
      },
      data: {
        id: '8b8109a2-2712-4f5d-9a78-cfbb97212d75',
        event: 'order.paid',
        externalId: 'woo_order_12345',
        orderId: 'order_12345',
        amount: 25000,
        currency: 'NGN',
        paymentProvider: 'paystack',
        occurredAt: '2026-06-14T10:30:00.000Z',
        customer: {
          email: 'customer@example.com',
          name: 'Ada Customer',
        },
      },
    });
  }

  private getWebhookVerificationExample() {
    return this.json({
      event: 'integration.paystack.sync.completed',
      data: {
        imported: 25,
        skipped: 3,
        fetched: 28,
        fetchedTransactions: 26,
        fetchedRefunds: 2,
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
        connectionId: 'cad65b2c-d876-462d-9f31-a3cc680fef98',
      },
    });
  }

  private json(value: unknown) {
    return JSON.stringify(value, null, 2);
  }
}
