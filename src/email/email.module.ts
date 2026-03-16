import { Module, Global } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { EmailService } from './email.service';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('SMTP_HOST', 'mailhog'),
          port: config.get('SMTP_PORT', 1025),
          ignoreTLS: true,
          secure: false, // true for 465, false for other ports
          auth: config.get('SMTP_USER')
            ? {
                user: config.get('SMTP_USER'),
                pass: config.get('SMTP_PASS'),
              }
            : undefined,
        },
        defaults: {
          from: `"MyTrackr" <${config.get('MAIL_FROM', 'noreply@mytrackr.app')}>`,
        },
        template: {
          dir: join(__dirname, 'templates'), // Works reliably out of /dist/email/templates post-build
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
