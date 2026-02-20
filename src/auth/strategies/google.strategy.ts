import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
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

    // Find existing user by googleId or email
    let user = await this.usersRepository.findOne({
      where: { googleId: id },
    });

    if (!user && email) {
      user = await this.usersRepository.findOne({
        where: { email },
      });
    }

    if (user) {
      // Update googleId if user exists but hasn't linked Google yet
      if (!user.googleId) {
        user.googleId = id;
        await this.usersRepository.save(user);
      }
    } else {
      // Create new user
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
    }

    done(null, user);
  }
}
