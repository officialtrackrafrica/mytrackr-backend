import { ConfigService } from '@nestjs/config';
import { DashboardSecurityService } from './dashboard-security.service';

describe('Dashboard form security', () => {
  let service: DashboardSecurityService;
  let consumed: Set<string>;
  let req: any;
  let res: any;
  beforeEach(() => {
    consumed = new Set();
    service = new DashboardSecurityService(
      new ConfigService({
        JWT_ACCESS_SECRET: 'test-secret',
        NODE_ENV: 'production',
      }),
      {
        set: jest.fn(async (key: string) => {
          if (consumed.has(key)) return null;
          consumed.add(key);
          return 'OK';
        }),
        eval: jest.fn().mockResolvedValue(1),
      } as any,
    );
    req = { cookies: {}, headers: {} };
    res = {
      cookie: jest.fn((name, value) => {
        req.cookies[name] = value;
      }),
      set: jest.fn(),
      setHeader: jest.fn(),
    };
  });

  it('accepts a signed form once and rejects duplicate submissions', async () => {
    const token = service.issue(req, res, 'session-one');
    expect(res.cookie).toHaveBeenCalledWith(
      '__Host-apiDashboardCsrf',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    await expect(
      service.consume(req, token, 'session-one'),
    ).resolves.toBeUndefined();
    await expect(
      service.consume(req, token, 'session-one'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows independent forms in different tabs without rotating the browser cookie', async () => {
    const one = service.issue(req, res, 'session-one');
    const two = service.issue(req, res, 'session-one');
    await service.consume(req, one, 'session-one');
    await expect(
      service.consume(req, two, 'session-one'),
    ).resolves.toBeUndefined();
    expect(res.cookie).toHaveBeenCalledTimes(1);
  });

  it.each(['different-session', 'login'])(
    'rejects a token used with %s',
    async (binding) => {
      const token = service.issue(req, res, 'session-one');
      await expect(service.consume(req, token, binding)).rejects.toMatchObject({
        status: 403,
      });
    },
  );

  it('rejects a missing cookie, tampered signatures and cross-site requests', async () => {
    const token = service.issue(req, res, 'session-one');
    await expect(
      service.consume({ ...req, cookies: {} }, token, 'session-one'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.consume(
        req,
        token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'),
        'session-one',
      ),
    ).rejects.toMatchObject({ status: 403 });
    req.headers['sec-fetch-site'] = 'cross-site';
    await expect(
      service.consume(req, token, 'session-one'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects expired forms', async () => {
    const token = service.issue(req, res, 'session-one');
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
    try {
      await expect(
        service.consume(req, token, 'session-one'),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      jest.restoreAllMocks();
    }
  });

  it.each([
    'https://evil.example/',
    'javascript:alert(1)',
    'https://checkout.paystack.com.evil.example/',
    'https://u:p@checkout.paystack.com/',
    'https://checkout.paystack.com:8443/',
  ])('rejects an unsafe checkout URL %s', (value) => {
    expect(() => service.checkoutUrl(value)).toThrow();
  });

  it('accepts the actual payment checkout host', () => {
    expect(service.checkoutUrl('https://checkout.paystack.com/valid')).toBe(
      'https://checkout.paystack.com/valid',
    );
  });
});
