import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import { AuthErrorFilter, AllExceptionsFilter } from './common/filters';
import { HttpAdapterHost } from '@nestjs/core';
import { SWAGGER_TAGS } from './common/docs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cookieParserFn = require('cookie-parser');
  app.use(cookieParserFn());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const httpAdapter = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new AuthErrorFilter(),
    new AllExceptionsFilter(httpAdapter),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('MyTrackr API')
    .setDescription('MyTrackr Authentication Platform API')
    .setVersion('1.0')
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
  app.use(
    '/api',
    apiReference({
      content: document,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application running on: ${await app.getUrl()}`);
}
void bootstrap();
