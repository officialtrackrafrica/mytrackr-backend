import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    const sslEnabled = this.configService.get<string>(
      'DATABASE_SSL',
      databaseUrl ? 'true' : 'false',
    );

    return {
      type: 'postgres',
      ...(databaseUrl
        ? { url: databaseUrl }
        : {
            host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
            port: this.configService.get<number>('DATABASE_PORT', 5432),
            username: this.configService.get<string>(
              'DATABASE_USERNAME',
              'postgres',
            ),
            password: this.configService.get<string>(
              'DATABASE_PASSWORD',
              'postgres',
            ),
            database: this.configService.get<string>(
              'DATABASE_NAME',
              'mytrackr',
            ),
          }),
      ssl:
        sslEnabled.toLowerCase() === 'true'
          ? {
              rejectUnauthorized:
                this.configService
                  .get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'true')
                  .toLowerCase() === 'true',
            }
          : false,
      autoLoadEntities: true,
      synchronize: true,
      logging: false,
    };
  }
}
