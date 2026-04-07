import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendWelcomeEmail(email: string, name?: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Welcome to MyTrackr!',
        template: './welcome', // refers to welcome.hbs
        context: {
          name: name || 'User',
        },
      });
      this.logger.debug(`Welcome email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send welcome email to ${email}`,
        error.stack,
      );
    }
  }

  async sendOtpEmail(email: string, name: string | undefined, otp: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Your MyTrackr Verification Code',
        template: './otp', // refers to otp.hbs
        context: {
          name: name || 'User',
          otp,
        },
      });
      this.logger.debug(`OTP email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Failed to send OTP email to ${email}`, error.stack);
    }
  }

  async sendPasswordResetOtpEmail(
    email: string,
    name: string | undefined,
    otp: string,
  ) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Your MyTrackr Password Reset Code',
        template: './otp',
        context: {
          name: name || 'User',
          otp,
        },
      });
      this.logger.debug(`Password reset OTP email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send password reset OTP email to ${email}`,
        error.stack,
      );
    }
  }
}
