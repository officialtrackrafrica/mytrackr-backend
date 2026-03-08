import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';
import { RolesService } from '../services';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private rolesService: RolesService,
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:5000/auth/google/callback',
      scope: ['email', 'profile'],
      passReqToCallback: false,
    } as any);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, emails, name } = profile;

    const email = emails?.[0]?.value;
    const firstName = name?.givenName;
    const lastName = name?.familyName;

    // Find by googleId first
    let user = await this.usersRepository.findOne({
      where: { googleId: id },
      relations: ['roles'],
    });

    if (!user && email) {
      // Try to find by email — this handles account merge
      user = await this.usersRepository.findOne({
        where: { email },
        relations: ['roles'],
      });
    }

    if (user) {
      // Merge: link googleId if not linked yet; mark as verified + active
      const updates: Partial<User> = {};
      if (!user.googleId) {
        // First time this email/password account is used with Google — log the merge
        this.logger.warn(
          `Account merge: Google identity linked to existing account [email=${email}, userId=${user.id}]`,
        );
        updates.googleId = id;
      }
      if (!user.isVerified) {
        updates.isVerified = true;
      }
      if (!user.isActive) {
        updates.isActive = true;
      }
      if (Object.keys(updates).length > 0) {
        await this.usersRepository.update(user.id, updates);
        Object.assign(user, updates);
      }
      // Ensure User role exists
      if (!user.roles || !user.roles.some((r) => r.name === 'User')) {
        await this.rolesService.assignRoleToUser(user.id, 'User');
      }
    } else {
      // Create new user via Google
      user = this.usersRepository.create({
        googleId: id,
        email,
        firstName,
        lastName,
        isVerified: true,
        isActive: true,
        securitySettings: { mfaEnabled: false },
      });
      user = await this.usersRepository.save(user);
      await this.rolesService.assignRoleToUser(user.id, 'User');
      // Re-fetch with roles
      user = (await this.usersRepository.findOne({
        where: { id: user.id },
        relations: ['roles'],
      }))!;
    }

    done(null, user);
  }
}
