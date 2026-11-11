import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Response } from 'express';
import { guides } from '../guides/guide-content';
import {
  guideCss,
  renderGuidesIndex,
  renderPlatformGuide,
} from '../guides/guide.view';

@ApiTags('Developer guides')
@Controller('developers')
export class GuidesController {
  private headers(res: Response) {
    const nonce = randomBytes(18).toString('base64');
    res.set({
      'Content-Security-Policy': `default-src 'none'; style-src 'self'; script-src 'nonce-${nonce}'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'public, max-age=300',
    });
    return nonce;
  }

  @Get('guides')
  @ApiOperation({
    summary: 'Public server-rendered website and mobile integration guides',
  })
  @ApiProduces('text/html')
  index(@Query('q') query: unknown, @Res() res: Response) {
    if (
      query !== undefined &&
      (typeof query !== 'string' || query.length > 120)
    )
      throw new BadRequestException(
        'Search must be text up to 120 characters.',
      );
    const nonce = this.headers(res);
    res
      .type('html')
      .send(
        renderGuidesIndex(nonce, typeof query === 'string' ? query.trim() : ''),
      );
  }

  @Get('guides/:slug')
  @ApiOperation({ summary: 'Read a platform integration walkthrough' })
  @ApiProduces('text/html')
  guide(@Param('slug') slug: string, @Res() res: Response) {
    const nonce = this.headers(res);
    const guide = guides.find((item) => item.slug === slug);
    if (!guide) {
      res
        .status(404)
        .type('html')
        .send(renderGuidesIndex(nonce, '', true));
      return;
    }
    res.type('html').send(renderPlatformGuide(guide, nonce));
  }

  @Get('assets/guides.css')
  css(@Res() res: Response) {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
    });
    res
      .type('text/css')
      .send(
        guideCss +
          '\n.screen-reader{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}',
      );
  }

  @Get('assets/:filename')
  asset(@Param('filename') filename: string, @Res() res: Response) {
    // Only shipped, public assets can be served. Never resolve arbitrary paths.
    if (
      ![
        'mytrackr-logo.png',
        'snapshot-create-integration.png',
        'snapshot-api-keys.png',
        'main-dashboard-link-button.png',
        'main-dashboard-link-website.png',
        'main-dashboard-api-key.png',
        'main-dashboard-paystack.png',
      ].includes(filename)
    ) {
      res.status(404).end();
      return;
    }
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600',
    });
    res.sendFile(join(__dirname, '..', 'assets', filename));
  }
}
