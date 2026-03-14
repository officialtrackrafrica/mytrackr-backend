import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import Redis from 'ioredis';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { AuthError } from '../errors/auth.error';
import { REDIS_CLIENT } from '../redis/redis.module';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  /** Cache of RateLimiterRedis instances keyed by "windowMs:max" */
  private readonly limiters = new Map<string, RateLimiterRedis>();

  constructor(
    private reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) ?? {
      windowMs: 15 * 60 * 1000,
      max: 100,
    };

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? 'unknown';
    const key = `${ip}:${request.path}`;

    const limiter = this.getLimiter(config);

    try {
      await limiter.consume(key);
      return true;
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        throw new AuthError(
          'RATE_LIMITED',
          'Too many requests, please try again later',
          429,
        );
      }

      this.logger.warn(`RateLimiter Redis error (fail-open): ${err}`);
      return true;
    }
  }

  private getLimiter(config: RateLimitConfig): RateLimiterRedis {
    const cacheKey = `${config.windowMs}:${config.max}`;
    if (!this.limiters.has(cacheKey)) {
      this.limiters.set(
        cacheKey,
        new RateLimiterRedis({
          storeClient: this.redis,
          keyPrefix: 'rl',

          duration: Math.ceil(config.windowMs / 1000),
          points: config.max,
        }),
      );
    }
    return this.limiters.get(cacheKey)!;
  }
}
