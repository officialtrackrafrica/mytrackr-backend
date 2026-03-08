import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Session, RevokedToken } from '../entities';
import { TokenBlacklistService } from '../../common/redis';

interface DeviceInfo {
  deviceId?: string;
  deviceType?: string;
  deviceName?: string;
  userAgent?: string;
}

// Access token lifetime in seconds (must match JWT expiresIn of 15m)
const ACCESS_TTL = 15 * 60;

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(RevokedToken)
    private revokedTokenRepository: Repository<RevokedToken>,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async createSession(
    userId: string,
    deviceInfo?: DeviceInfo,
    ipAddress?: string,
  ): Promise<Session> {
    const session = this.sessionRepository.create({
      userId,
      deviceInfo,
      ipAddress,
      lastActiveAt: new Date(),
    });

    return this.sessionRepository.save(session);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessionRepository.findOne({
      where: { id: sessionId, revokedAt: IsNull() },
    });
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastActiveAt: 'DESC' },
    });
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      lastActiveAt: new Date(),
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      revokedAt: new Date(),
    });

    // Revoke all tokens associated with this session in DB
    await this.revokedTokenRepository.update(
      { sessionId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.sessionRepository.find({
      where: { userId, revokedAt: IsNull() },
    });

    for (const session of sessions) {
      await this.revokeSession(session.id);
    }
  }

  async storeTokenId(
    jti: string,
    userId: string,
    sessionId?: string,
  ): Promise<void> {
    const tokenRecord = this.revokedTokenRepository.create({
      jti,
      userId,
      sessionId,
    });

    await this.revokedTokenRepository.save(tokenRecord);
  }

  /**
   * Revoke a specific token by JTI.
   * Updates the Postgres record AND instantly blacklists in Redis
   * so the JwtStrategy can reject it without a DB query.
   */
  async revokeToken(jti: string): Promise<void> {
    await this.revokedTokenRepository.update(
      { jti },
      { revokedAt: new Date() },
    );
    // Immediately invalidate in Redis (O(1) lookup in JwtStrategy)
    await this.tokenBlacklist.blacklist(jti, ACCESS_TTL);
  }

  /**
   * Collect all active (non-revoked) token JTIs for a user,
   * blacklist them in Redis, and mark them revoked in Postgres.
   */
  async revokeAndBlacklistAllForUser(userId: string): Promise<void> {
    const activeTokens = await this.revokedTokenRepository.find({
      where: { userId, revokedAt: IsNull() },
    });

    const jtis = activeTokens.map((t) => t.jti);

    // Bulk blacklist in Redis first (fast, in memory)
    await this.tokenBlacklist.blacklistMany(jtis, ACCESS_TTL);

    // Then mark all as revoked in Postgres
    if (activeTokens.length) {
      for (const token of activeTokens) {
        await this.revokedTokenRepository.update(
          { jti: token.jti },
          { revokedAt: new Date() },
        );
      }
    }

    // Revoke all active sessions
    await this.revokeAllUserSessions(userId);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    // Check Redis first (fast path)
    const inRedis = await this.tokenBlacklist.isBlacklisted(jti);
    if (inRedis) return true;

    // Fall back to Postgres (handles refresh token revocation which
    // may not be in Redis cache)
    const token = await this.revokedTokenRepository.findOne({
      where: { jti },
    });

    return token?.revokedAt ? true : false;
  }
}
