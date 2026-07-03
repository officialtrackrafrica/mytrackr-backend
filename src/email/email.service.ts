import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendCustomEmail(email: string, subject: string, body: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        text: body,
        html: this.toBasicHtml(body),
      });
      this.logger.debug(`Custom email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Failed to send custom email to ${email}`, error.stack);
      throw error;
    }
  }

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

  async sendUncategorizedTransactionsReminderEmail(
    email: string,
    name: string | undefined,
    uncategorizedCount: number,
    dashboardUrl: string,
  ) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Action needed: categorize your transactions',
        template: './uncategorized-transactions-reminder',
        context: {
          name: name || 'User',
          uncategorizedCount,
          dashboardUrl,
        },
      });
      this.logger.debug(
        `Uncategorized transactions reminder email sent to ${email}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send uncategorized transactions reminder email to ${email}`,
        error.stack,
      );
      throw error;
    }
  }

  private toBasicHtml(body: string) {
    return body
      .split(/\r?\n/)
      .map((line) => `<p>${this.escapeHtml(line) || '&nbsp;'}</p>`)
      .join('');
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
