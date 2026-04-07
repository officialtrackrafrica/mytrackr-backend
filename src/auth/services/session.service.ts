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

const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 7 * 24 * 60 * 60;

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
    await this.revokeSessionWithTokens(sessionId);
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

  async revokeToken(jti: string): Promise<void> {
    await this.revokedTokenRepository.update(
      { jti },
      { revokedAt: new Date() },
    );

    await this.tokenBlacklist.blacklist(jti, ACCESS_TTL);
  }

  async revokeTokenWithTtl(jti: string, ttl: number): Promise<void> {
    await this.revokedTokenRepository.update(
      { jti },
      { revokedAt: new Date() },
    );

    await this.tokenBlacklist.blacklist(jti, ttl);
  }

  async revokeSessionWithTokens(sessionId: string): Promise<void> {
    const activeTokens = await this.revokedTokenRepository.find({
      where: { sessionId, revokedAt: IsNull() },
    });

    for (const token of activeTokens) {
      await this.revokeTokenWithTtl(token.jti, REFRESH_TTL);
    }

    await this.sessionRepository.update(sessionId, {
      revokedAt: new Date(),
    });
  }

  async revokeAndBlacklistAllForUser(userId: string): Promise<void> {
    const activeTokens = await this.revokedTokenRepository.find({
      where: { userId, revokedAt: IsNull() },
    });

    for (const token of activeTokens) {
      await this.revokeTokenWithTtl(token.jti, REFRESH_TTL);
    }

    await this.revokeAllUserSessions(userId);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const inRedis = await this.tokenBlacklist.isBlacklisted(jti);
    if (inRedis) return true;

    const token = await this.revokedTokenRepository.findOne({
      where: { jti },
    });

    return token?.revokedAt ? true : false;
  }
}
