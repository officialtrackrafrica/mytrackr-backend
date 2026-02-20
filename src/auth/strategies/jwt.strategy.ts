import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SessionService } from '../services';
import { User } from '../entities';

interface JwtPayload {
  sub: string;
  sessionId: string;
  type: 'access' | 'refresh';
  jti?: string;
  deviceId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private sessionService: SessionService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Check if session is still valid
    const session = await this.sessionService.getSession(payload.sessionId);
    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Update session activity
    await this.sessionService.updateSessionActivity(payload.sessionId);

    // Fetch user with roles for CASL RBAC
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return the full user object (with roles) merged with session info
    return {
      ...user,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
    };
  }
}
