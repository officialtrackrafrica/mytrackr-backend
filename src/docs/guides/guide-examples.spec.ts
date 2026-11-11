import * as ts from 'typescript';
import { guides, serverSenderSource } from './guide-content';

const decode = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
const example = (slug: string, id: string) => {
  const html = guides
    .find((guide) => guide.slug === slug)!
    .sections.map((section) => section.html)
    .join('');
  return decode(
    html.match(new RegExp(`<code id="${id}">([\\s\\S]*?)<\\/code>`))![1],
  );
};

describe('Published guide code examples', () => {
  it('parses the React example as valid JSX', () => {
    const source = ts.createSourceFile(
      'SyncOrder.jsx',
      example('react', 'react-component'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JSX,
    );
    expect((source as any).parseDiagnostics).toEqual([]);
  });

  it('parses the Vue setup script without accidentally including raw script tags in the guide page', () => {
    const component = example('vue', 'vue-component');
    const script = component.match(/<script setup>([\s\S]*?)<\/script>/)![1];
    const source = ts.createSourceFile(
      'setup.js',
      script,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    expect((source as any).parseDiagnostics).toEqual([]);
    const html = guides
      .find((guide) => guide.slug === 'vue')!
      .sections.map((section) => section.html)
      .join('');
    expect(html).not.toContain('<script setup>');
  });

  const setupSender = () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 'event-one', duplicate: false }),
      });
    const send = new Function(
      'process',
      'fetch',
      'AbortSignal',
      serverSenderSource.replace('export async function', 'async function') +
        '\nreturn recordPaidOrder;',
    )(
      {
        env: {
          MYTRACKR_API_URL: 'https://mytrackr.example',
          MYTRACKR_API_KEY: 'mt_sk_example_only',
        },
      },
      fetch,
      { timeout: () => undefined },
    );
    return { send, fetch };
  };

  it('sends the verified order with the correct units, header, and stable event ID', async () => {
    const { send, fetch } = setupSender();
    const order = {
      id: '1001',
      paymentStatus: 'paid',
      total: '2500',
      currency: 'NGN',
      paidAt: '2026-11-11T10:00:00Z',
    };
    await expect(send(order)).resolves.toEqual({
      id: 'event-one',
      duplicate: false,
    });
    await send(order);
    expect(fetch.mock.calls[0][0].href).toBe(
      'https://mytrackr.example/integrations/events',
    );
    expect(fetch.mock.calls[0][1].headers['x-mytrackr-api-key']).toBe(
      'mt_sk_example_only',
    );
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const retry = JSON.parse(fetch.mock.calls[1][1].body);
    expect(first).toMatchObject({
      amount: 2500,
      currency: 'NGN',
      externalId: 'store:1001:paid',
      occurredAt: '2026-11-11T10:00:00.000Z',
    });
    expect(retry.externalId).toBe(first.externalId);
  });

  it.each([
    {
      id: '1001',
      paymentStatus: 'pending',
      total: 10,
      currency: 'NGN',
      paidAt: '2026-11-11',
    },
    {
      id: '1001',
      paymentStatus: 'paid',
      total: -1,
      currency: 'NGN',
      paidAt: '2026-11-11',
    },
    {
      id: '1001',
      paymentStatus: 'paid',
      total: 'bad',
      currency: 'NGN',
      paidAt: '2026-11-11',
    },
    {
      id: '1001',
      paymentStatus: 'paid',
      total: 10,
      currency: 'NGN',
      paidAt: 'invalid',
    },
  ])(
    'rejects invalid order data before making a network request: %j',
    async (order) => {
      const { send, fetch } = setupSender();
      await expect(send(order)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
