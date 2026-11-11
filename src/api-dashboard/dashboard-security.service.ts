import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis';

export const DASHBOARD_PATH = '/api/dashboard';
export const DASHBOARD_ACCESS = 'apiDashboardAccess';
export const DASHBOARD_REFRESH = 'apiDashboardRefresh';

@Injectable()
export class DashboardSecurityService {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private get cookieName() {
    return this.config.get('NODE_ENV') === 'production'
      ? '__Host-apiDashboardCsrf'
      : 'apiDashboardCsrf';
  }

  accessCookieName() {
    return this.config.get('NODE_ENV') === 'production'
      ? `__Host-${DASHBOARD_ACCESS}`
      : DASHBOARD_ACCESS;
  }
  refreshCookieName() {
    return this.config.get('NODE_ENV') === 'production'
      ? `__Host-${DASHBOARD_REFRESH}`
      : DASHBOARD_REFRESH;
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      // __Host- cookies require path=/ and forbid Domain; sibling subdomains
      // cannot inject login or session cookies into this dashboard.
      path: this.config.get('NODE_ENV') === 'production' ? '/' : DASHBOARD_PATH,
    };
  }

  headers(res: Response) {
    const nonce = randomBytes(18).toString('base64');
    res.set({
      'Cache-Control': 'no-store, private',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': `default-src 'none'; style-src 'self'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`,
    });
    if (this.config.get('NODE_ENV') === 'production')
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    return nonce;
  }

  issue(req: Request, res: Response, binding = 'login') {
    let browser = req.cookies?.[this.cookieName];
    if (typeof browser !== 'string' || !/^[a-f0-9]{64}$/.test(browser)) {
      browser = randomBytes(32).toString('hex');
      res.cookie(this.cookieName, browser, {
        ...this.cookieOptions(),
        maxAge: 7 * 86400_000,
      });
    }
    const value = `${randomBytes(24).toString('hex')}.${Date.now() + 15 * 60_000}`;
    return `${value}.${this.sign(`${value}.${browser}.${binding}`)}`;
  }

  async consume(req: Request, token: unknown, binding = 'login') {
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw new ForbiddenException('Cross-site submissions are not allowed.');
    // Signed, cookie- and session-bound tokens protect forms even behind a proxy.
    const browser = req.cookies?.[this.cookieName];
    if (
      typeof token !== 'string' ||
      !/^[a-f0-9]{48}\.\d{13}\.[a-f0-9]{64}$/.test(token) ||
      typeof browser !== 'string'
    ) {
      throw new ForbiddenException(
        'This form has expired. Reload the page and try again.',
      );
    }
    const [id, expiry, signature] = token.split('.');
    const expected = this.sign(`${id}.${expiry}.${browser}.${binding}`);
    if (
      Number(expiry) < Date.now() ||
      Number(expiry) > Date.now() + 16 * 60_000 ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new ForbiddenException(
        'This form has expired. Reload the page and try again.',
      );
    }
    const claimed = await this.redis.set(
      `api-dashboard:form:${id}`,
      'used',
      'EX',
      960,
      'NX',
    );
    if (!claimed)
      throw new ConflictException(
        'This form was already submitted. Reload the dashboard before trying again.',
      );
  }

  async rateLimit(scope: string, limit = 20, seconds = 60) {
    const key = `api-dashboard:rate:${createHash('sha256').update(scope).digest('hex')}`;
    const count = await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      key,
      seconds,
    );
    if (Number(count) > limit)
      throw new HttpException(
        'Too many attempts. Please wait before trying again.',
        429,
      );
  }

  async markSession(sessionId: string, userId: string) {
    await this.redis.set(
      `api-dashboard:session:${sessionId}`,
      userId,
      'EX',
      7 * 86400,
    );
  }

  async hasSession(sessionId: string, userId: string) {
    return (
      (await this.redis.get(`api-dashboard:session:${sessionId}`)) === userId
    );
  }

  async forgetSession(sessionId: string) {
    await this.redis.del(`api-dashboard:session:${sessionId}`);
  }

  setTokens(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.cookie(this.accessCookieName(), tokens.accessToken, {
      ...this.cookieOptions(),
      maxAge: 15 * 60_000,
    });
    res.cookie(this.refreshCookieName(), tokens.refreshToken, {
      ...this.cookieOptions(),
      maxAge: 7 * 86400_000,
    });
  }

  clearTokens(res: Response) {
    for (const name of [
      this.accessCookieName(),
      this.refreshCookieName(),
      this.cookieName,
    ])
      res.clearCookie(name, this.cookieOptions());
  }

  checkoutUrl(value: unknown): string {
    try {
      const url = new URL(String(value));
      if (
        url.protocol === 'https:' &&
        url.hostname === 'checkout.paystack.com' &&
        !url.username &&
        !url.password &&
        !url.port
      )
        return url.href;
    } catch {
      /* Fail closed for malformed gateway responses. */
    }
    throw new BadRequestException(
      'The payment provider did not return a valid checkout URL. Please try again.',
    );
  }

  private sign(value: string) {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret)
      throw new ServiceUnavailableException(
        'Dashboard security is unavailable.',
      );
    return createHmac('sha256', secret).update(value).digest('hex');
  }
}
