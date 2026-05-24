import cookieParser from 'cookie-parser';
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthErrorFilter, AllExceptionsFilter } from './common/filters';
import { HttpAdapterHost } from '@nestjs/core';
import { SWAGGER_TAGS } from './common/docs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const httpAdapter = app.get(HttpAdapterHost);
  const expressApp = app.getHttpAdapter().getInstance();

  app.use(cookieParser());

  app.use(
    express.json({
      verify: (req: any, res: any, buf: Buffer) => {
        req.rawBody = buf;
        const logger = new Logger('Main');
        if (req.originalUrl && req.originalUrl.includes('/webhooks')) {
          logger.debug(
            `Captured rawBody for ${req.originalUrl}, length: ${buf.length}`,
          );
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(
    new AuthErrorFilter(),
    new AllExceptionsFilter(httpAdapter),
  );

  const rawOrigins = process.env.CORS_ORIGINS;
  if (!rawOrigins && process.env.NODE_ENV === 'production') {
    logger.error(
      'CORS_ORIGINS environment variable is not set. Refusing to start with wildcard CORS in production.',
    );
    process.exit(1);
  }
  const allowedOrigins: string[] = rawOrigins
    ? rawOrigins
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : ['http://localhost:3001'];
  logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('MyTrackr API')
    .setDescription('MyTrackr API — Financial tracking for African businesses')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
      description: 'httpOnly access token cookie (set automatically on login)',
    });

  SWAGGER_TAGS.forEach((tag) => {
    config.addTag(tag.name, tag.description);
  });

  const document = SwaggerModule.createDocument(app, config.build());
  SwaggerModule.setup('swagger', app, document, {
    jsonDocumentUrl: 'swagger-json',
    yamlDocumentUrl: 'swagger-yaml',
  });

  expressApp.get('/docs', (_req: any, res: any) => {
    res.redirect(302, '/swagger');
  });
  expressApp.get('/docs/', (_req: any, res: any) => {
    res.redirect(302, '/swagger');
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  logger.log(`Application running on: ${await app.getUrl()}`);
  logger.log(`Swagger UI available at: ${await app.getUrl()}/swagger`);
}
void bootstrap();
