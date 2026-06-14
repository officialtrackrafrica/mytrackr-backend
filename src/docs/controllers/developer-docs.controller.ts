import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DeveloperDocsService } from '../services/developer-docs.service';

@Controller('developers')
export class DeveloperDocsController {
  constructor(private readonly developerDocsService: DeveloperDocsService) {}

  @Get('integrations')
  getIntegrationsGuide(@Req() req: Request, @Res() res: Response) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const html = this.developerDocsService.renderIntegrationsPage(baseUrl);
    res.type('html').send(html);
  }
}
