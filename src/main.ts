import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthErrorFilter, AllExceptionsFilter } from './common/filters';
import { HttpAdapterHost } from '@nestjs/core';
import { SWAGGER_TAGS } from './common/docs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global auth error filter
  const httpAdapter = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new AuthErrorFilter(),
    new AllExceptionsFilter(httpAdapter),
  );

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('MyTrackr API')
    .setDescription('MyTrackr Authentication Platform API')
    .setVersion('1.0')
    .addBearerAuth();

  // Apply tags order
  SWAGGER_TAGS.forEach((tag) => {
    config.addTag(tag.name, tag.description);
  });

  const document = SwaggerModule.createDocument(app, config.build());
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application running on: ${await app.getUrl()}`);
}
void bootstrap();
