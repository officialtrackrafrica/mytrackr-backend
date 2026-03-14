import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

const BL_PREFIX = 'bl:';

const ACCESS_TOKEN_TTL = 15 * 60;

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async blacklist(jti: string, ttl = ACCESS_TOKEN_TTL): Promise<void> {
    try {
      await this.redis.set(`${BL_PREFIX}${jti}`, '1', 'EX', ttl);
    } catch (err) {
      this.logger.warn(`Redis blacklist write failed for jti=${jti}: ${err}`);
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(`${BL_PREFIX}${jti}`);
      return result === 1;
    } catch (err) {
      this.logger.warn(`Redis blacklist read failed for jti=${jti}: ${err}`);
      return false;
    }
  }

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
