import { PaystackService } from './paystack.service';

describe('Paystack checkout channels', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    { channels: undefined, plan: 'PLN_1', expectedChannels: ['card'] },
    { channels: [], plan: undefined, expectedChannels: undefined },
  ])(
    'respects checkout channel overrides %j',
    async ({ channels, plan, expectedChannels }) => {
      const request = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            authorization_url: 'https://checkout.example',
            reference: 'ref',
          },
        }),
      } as Response);
      const service = new PaystackService({
        get: (key) =>
          ({
            PAYSTACK_SECRET_KEY: 'secret',
            PAYSTACK_CHECKOUT_CHANNELS: 'card',
          })[key],
      } as any);
      await service.initializePayment({
        email: 'user@example.com',
        amount: 500000,
        reference: 'ref',
        plan,
        channels,
      });
      const body = JSON.parse(request.mock.calls[0][1]!.body as string);
      expect(body.channels).toEqual(expectedChannels);
      expect(body.plan).toBe(plan);
      if (!plan) expect(body).not.toHaveProperty('plan');
    },
  );
});
