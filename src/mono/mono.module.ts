import { Module } from '@nestjs/common';
import { MonoService } from './mono.service';
import { MonoController } from './mono.controller';

import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { MonoAccount } from './entities/mono-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MonoAccount])],
  providers: [MonoService],
  controllers: [MonoController],
  exports: [MonoService],
})
export class MonoModule {}
