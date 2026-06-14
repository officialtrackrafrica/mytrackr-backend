import { Module } from '@nestjs/common';
import { DeveloperDocsController } from './controllers/developer-docs.controller';
import { DeveloperDocsService } from './services/developer-docs.service';

@Module({
  controllers: [DeveloperDocsController],
  providers: [DeveloperDocsService],
})
export class DocsModule {}
