import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AiCategorizationService } from './categorization.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'CATEGORIZATION_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'categorization',
            protoPath: join(__dirname, '../proto/categorization.proto'),
            url: configService.get<string>(
              'CATEGORIZATION_ENGINE_URL',
              'localhost:50051',
            ),
          },
        }),
      },
    ]),
  ],
  providers: [AiCategorizationService],
  exports: [AiCategorizationService],
})
export class CategorizationModule {}
