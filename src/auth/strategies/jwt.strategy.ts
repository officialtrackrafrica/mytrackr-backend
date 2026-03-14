import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { SessionService } from '../services';
import { User } from '../entities';
import { TokenBlacklistService } from '../../common/redis';

interface JwtPayload {
  sub: string;
  sessionId: string;
  type: 'access' | 'refresh';
  jti?: string;
  deviceId?: string;
}

function cookieExtractor(req: Request): string | null {
  if (req && req.cookies) {
    return req.cookies['accessToken'] || null;
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private sessionService: SessionService,
    private tokenBlacklist: TokenBlacklistService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        const fromCookie = cookieExtractor(req);
        if (fromCookie) return fromCookie;
        return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (payload.jti) {
      const blacklisted = await this.tokenBlacklist.isBlacklisted(payload.jti);
      if (blacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const session = await this.sessionService.getSession(payload.sessionId);
    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    await this.sessionService.updateSessionActivity(payload.sessionId);

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      ...user,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      accessJti: payload.jti,
    };
  }
}
