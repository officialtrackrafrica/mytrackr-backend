import { Module } from '@nestjs/common';
import { DeveloperDocsController } from './controllers/developer-docs.controller';
import { DeveloperDocsService } from './services/developer-docs.service';
import { GuidesController } from './controllers/guides.controller';

@Module({
  controllers: [DeveloperDocsController, GuidesController],
  providers: [DeveloperDocsService],
})
export class DocsModule {}
