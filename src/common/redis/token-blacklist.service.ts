import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

const BL_PREFIX = 'bl:';
// Access token TTL in seconds (must match JWT expiresIn of 15m)
const ACCESS_TOKEN_TTL = 15 * 60;

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Blacklist an access-token JTI for its remaining lifetime.
   * @param jti  - JWT ID claim from the token
   * @param ttl  - Remaining seconds until expiry (default: 15m — full access TTL)
   */
  async blacklist(jti: string, ttl = ACCESS_TOKEN_TTL): Promise<void> {
    try {
      await this.redis.set(`${BL_PREFIX}${jti}`, '1', 'EX', ttl);
    } catch (err) {
      // Fail-open: log but do not crash the request
      this.logger.warn(`Redis blacklist write failed for jti=${jti}: ${err}`);
    }
  }

  /**
   * Check whether a JTI has been blacklisted.
   * Returns false (allow) on Redis failure to avoid locking out users.
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(`${BL_PREFIX}${jti}`);
      return result === 1;
    } catch (err) {
      this.logger.warn(`Redis blacklist read failed for jti=${jti}: ${err}`);
      return false; // fail-open
    }
  }

  /**
   * Blacklist all active access tokens for a user by scanning the
   * revoked_token pattern. Since we track jtis independently, this
   * method is called with collected jtis from the session service.
   */
  async blacklistMany(jtis: string[], ttl = ACCESS_TOKEN_TTL): Promise<void> {
    if (!jtis.length) return;
    try {
      const pipeline = this.redis.pipeline();
      for (const jti of jtis) {
        pipeline.set(`${BL_PREFIX}${jti}`, '1', 'EX', ttl);
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`Redis bulk blacklist failed: ${err}`);
    }
  }
}
