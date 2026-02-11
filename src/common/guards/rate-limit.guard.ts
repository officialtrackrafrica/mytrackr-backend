import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthError } from '../errors/auth.error';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);

@Injectable()
export class RateLimitGuard implements CanActivate {
  // In-memory rate limit store (for development)
  // In production, use Redis
  private rateLimitStore = new Map<
    string,
    { count: number; resetTime: number }
  >();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rateLimitConfig = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests
    };

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.ip}:${request.path}`;

    const now = Date.now();
    const record = this.rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      // New window
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + rateLimitConfig.windowMs,
      });
      return true;
    }

    if (record.count >= rateLimitConfig.max) {
      throw new AuthError(
        'RATE_LIMITED',
        'Too many requests, please try again later',
        429,
      );
    }

    record.count++;
    return true;
  }
}
