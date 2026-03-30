import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';

async function bootstrap() {
  const logger = new Logger('SeederMain');
  logger.log('Starting standalone seeder application...');

  const app = await NestFactory.createApplicationContext(AppModule);

  // Since SeedingService is onModuleInit, it will run automatically when context is created.
  // However, we wait for a bit to ensure it finishes or we can explicitly get it.
  logger.log('Seeder completed, shutting down.');
  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  const logger = new Logger('SeederError');
  logger.error('Seeding process failed', err.stack);
  process.exit(1);
});
