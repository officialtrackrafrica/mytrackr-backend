import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  generateSecret as otpGenerateSecret,
  generateURI as otpGenerateURI,
  verify as otpVerify,
} from 'otplib';
import * as QRCode from 'qrcode';
import { User } from '../entities';
import { EncryptionService } from '../../security/encryption.service';
import { AuthError } from '../../common/errors';
import {
  EnableMfaResponseDto,
  MfaEnabledResponseDto,
  DisableMfaResponseDto,
  BackupCodesResponseDto,
} from '../dto/mfa.dto';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly APP_NAME = 'MyTrackr';

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async generateSecret(userId: string): Promise<EnableMfaResponseDto> {
    const user = await this.findUserOrFail(userId);

    if (user.securitySettings?.mfaEnabled) {
      throw new AuthError(
        'MFA_ALREADY_ENABLED',
        'Two-factor authentication is already enabled',
        400,
      );
    }

    const secret = otpGenerateSecret();

    const accountName = user.email || user.phone || user.id;
    const otpauthUrl = otpGenerateURI({
      issuer: this.APP_NAME,
      label: accountName,
      secret,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.usersRepository.update(user.id, {
      securitySettings: {
        ...user.securitySettings,
        mfaSecret: secret,
        mfaMethod: 'totp',
      },
    });

    this.logger.log(`MFA secret generated for user ${user.id}`);

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
    };
  }

  async verifyAndEnable(
    userId: string,
    token: string,
  ): Promise<MfaEnabledResponseDto> {
    const user = await this.findUserOrFail(userId);

    if (user.securitySettings?.mfaEnabled) {
      throw new AuthError(
        'MFA_ALREADY_ENABLED',
        'Two-factor authentication is already enabled',
        400,
      );
    }

    if (!user.securitySettings?.mfaSecret) {
      throw new AuthError(
        'MFA_NOT_INITIATED',
        'Please call /auth/mfa/enable first to generate a secret',
        400,
      );
    }

    const result = await otpVerify({
      secret: user.securitySettings.mfaSecret,
      token,
    });

    if (!result.valid) {
      throw new AuthError(
        'INVALID_MFA_TOKEN',
        'Invalid verification code. Please try again.',
        400,
      );
    }

    const backupCodes = this.generateBackupCodes();

    await this.usersRepository.update(user.id, {
      securitySettings: {
        ...user.securitySettings,
        mfaEnabled: true,
        mfaBackupCodes: backupCodes,
      },
    });

    this.logger.log(`MFA enabled for user ${user.id}`);

    return {
      mfaEnabled: true,
      backupCodes,
    };
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.findUserOrFail(userId);

    if (
      !user.securitySettings?.mfaEnabled ||
      !user.securitySettings?.mfaSecret
    ) {
      throw new AuthError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);
    }

    const result = await otpVerify({
      secret: user.securitySettings.mfaSecret,
      token,
    });

    if (result.valid) {
      return true;
    }

    const backupCodes = user.securitySettings.mfaBackupCodes || [];
    const codeIndex = backupCodes.indexOf(token.toUpperCase());

    if (codeIndex !== -1) {
      const updatedCodes = [...backupCodes];
      updatedCodes.splice(codeIndex, 1);

      await this.usersRepository.update(user.id, {
        securitySettings: {
          ...user.securitySettings,
          mfaBackupCodes: updatedCodes,
        },
      });

      this.logger.warn(
        `Backup code used for user ${user.id}. ${updatedCodes.length} remaining.`,
      );
      return true;
    }

    return false;
  }

  async disable(
    userId: string,
    token: string,
    password: string,
  ): Promise<DisableMfaResponseDto> {
    const user = await this.findUserOrFail(userId);

    if (!user.securitySettings?.mfaEnabled) {
      throw new AuthError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);
    }

    if (!user.passwordHash) {
      throw new AuthError(
        'PASSWORD_REQUIRED',
        'Password verification required',
        400,
      );
    }

    const isPasswordValid = await this.encryptionService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new AuthError('INVALID_PASSWORD', 'Invalid password', 401);
    }

    const result = await otpVerify({
      secret: user.securitySettings.mfaSecret!,
      token,
    });

    if (!result.valid) {
      throw new AuthError(
        'INVALID_MFA_TOKEN',
        'Invalid verification code',
        400,
      );
    }

    await this.usersRepository.update(user.id, {
      securitySettings: {
        ...user.securitySettings,
        mfaEnabled: false,
        mfaSecret: undefined,
        mfaMethod: undefined,
        mfaBackupCodes: undefined,
      },
    });

    this.logger.log(`MFA disabled for user ${user.id}`);

    return {
      mfaEnabled: false,
      message: 'Two-factor authentication has been disabled',
    };
  }

  async regenerateBackupCodes(
    userId: string,
    token: string,
  ): Promise<BackupCodesResponseDto> {
    const user = await this.findUserOrFail(userId);

    if (
      !user.securitySettings?.mfaEnabled ||
      !user.securitySettings?.mfaSecret
    ) {
      throw new AuthError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);
    }

    const result = await otpVerify({
      secret: user.securitySettings.mfaSecret,
      token,
    });

    if (!result.valid) {
      throw new AuthError(
        'INVALID_MFA_TOKEN',
        'Invalid verification code',
        400,
      );
    }

    const backupCodes = this.generateBackupCodes();

    await this.usersRepository.update(user.id, {
      securitySettings: {
        ...user.securitySettings,
        mfaBackupCodes: backupCodes,
      },
    });

    this.logger.log(`Backup codes regenerated for user ${user.id}`);

    return { backupCodes };
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private generateBackupCodes(count = 10): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }

    return codes;
  }
}
