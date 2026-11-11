import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/services/auth.service';
import { IntegrationsService } from '../integrations/services/integrations.service';
import { SubscriptionService } from '../payments/services/subscription.service';
import { planHasCapability } from '../common/access-control/plan-entitlements';
import { ApiDashboardService } from './dashboard.service';
import { DashboardSecurityService } from './dashboard-security.service';
import { DashboardAuthGuard } from './dashboard-auth.guard';
import { DashboardExceptionFilter } from './dashboard-exception.filter';
import {
  DashboardCheckoutDto,
  DashboardFormDto,
  DashboardIntegrationDto,
  DashboardLoginDto,
  DashboardQueryDto,
  DashboardSensitiveDto,
  DashboardVerifyPaymentDto,
} from './dashboard.dto';
import { dashboardCss, dashboardPage, loginPage } from './dashboard.view';

type DashboardRequest = Request & {
  user: { id: string; email: string; sessionId: string };
};

@ApiExcludeController()
@Controller('api/dashboard')
@UseFilters(DashboardExceptionFilter)
export class DashboardPublicController {
  constructor(
    private readonly security: DashboardSecurityService,
    private readonly dashboard: ApiDashboardService,
  ) {}

  @Get('assets/dashboard.css')
  css(@Res() res: Response) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('text/css').send(dashboardCss);
  }

  @Get('login')
  login(@Req() req: Request, @Res() res: Response) {
    const nonce = this.security.headers(res);
    res.type('html').send(loginPage(this.security.issue(req, res), nonce));
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async signIn(
    @Body() dto: DashboardLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.security.headers(res);
    await this.security.consume(req, dto.csrf);
    const tokens = await this.dashboard.login(dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    this.security.setTokens(res, tokens);
    res.redirect(303, '/api/dashboard');
  }
}

@ApiExcludeController()
@Controller('api/dashboard')
@UseFilters(DashboardExceptionFilter)
@UseGuards(DashboardAuthGuard)
export class ApiDashboardController {
  constructor(
    private readonly dashboard: ApiDashboardService,
    private readonly security: DashboardSecurityService,
    private readonly integrations: IntegrationsService,
    private readonly subscriptions: SubscriptionService,
    private readonly auth: AuthService,
  ) {}

  @Get([
    '',
    'overview',
    'integrations',
    'keys',
    'settings',
    'events',
    'webhooks',
    'billing',
    'docs',
  ])
  async page(
    @Query() query: DashboardQueryDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    const last = req.path.split('/').filter(Boolean).pop()!;
    const section = last === 'dashboard' ? 'overview' : last;
    await this.render(req, res, section, query);
  }

  private async render(
    req: DashboardRequest,
    res: Response,
    section: string,
    query: DashboardQueryDto = {},
    extra: {
      secret?: string;
      secretIntegrationId?: string;
      webhookSecret?: string;
      message?: string;
    } = {},
  ) {
    const data = await this.dashboard.data(
      req.user.id,
      section,
      query.page || 1,
      query.integrationId,
    );
    const nonce = this.security.headers(res);
    const csrf = this.security.issue(req, res, req.user.sessionId);
    res.type('html').send(
      dashboardPage({
        section,
        data,
        csrf,
        nonce,
        email: req.user.email,
        canManage: Boolean(
          data.subscription.hasActiveSubscription &&
          planHasCapability(data.subscription.activePlan, 'website_linking'),
        ),
        ...extra,
      }),
    );
  }

  private async consume(req: DashboardRequest, csrf: string) {
    await this.security.consume(req, csrf, req.user.sessionId);
    await this.security.rateLimit(`actions:${req.user.id}`, 30, 60);
  }

  @Post('integrations')
  async create(
    @Body() dto: DashboardIntegrationDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    const values = this.dashboard.normalizeIntegration(dto);
    const result = await this.dashboard.withMutationLock(
      req.user.id,
      async () => {
        await this.subscriptions.assertUserHasCapability(
          req.user.id,
          'website_linking',
        );
        return this.integrations.create(req.user.id, values);
      },
    );
    await this.render(
      req,
      res,
      'keys',
      { integrationId: result.id },
      {
        secret: result.apiKey,
        webhookSecret: result.webhookSigningSecret,
        secretIntegrationId: result.id,
        message:
          'Integration created. Save your secret key before leaving this page.',
      },
    );
  }

  @Post('integrations/:id/settings')
  async settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DashboardIntegrationDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    const values = this.dashboard.normalizeIntegration(dto);
    await this.dashboard.withMutationLock(req.user.id, async () => {
      await this.subscriptions.assertUserHasCapability(
        req.user.id,
        'website_linking',
      );
      const owned = await this.dashboard.owned(req.user.id, id);
      if (!owned.isActive)
        throw new BadRequestException(
          'Revoked integrations cannot be updated.',
        );
      await this.integrations.update(req.user.id, id, values);
    });
    res.redirect(
      303,
      `/api/dashboard/settings?integrationId=${encodeURIComponent(id)}`,
    );
  }

  @Post('integrations/:id/rotate-key')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async rotate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DashboardSensitiveDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    await this.dashboard.owned(req.user.id, id);
    await this.dashboard.reauthenticate(req.user.id, dto.password);
    const result = await this.dashboard.withMutationLock(
      req.user.id,
      async () => {
        await this.subscriptions.assertUserHasCapability(
          req.user.id,
          'website_linking',
        );
        const owned = await this.dashboard.owned(req.user.id, id);
        if (!owned.isActive)
          throw new BadRequestException(
            'Revoked integrations cannot rotate keys.',
          );
        return this.integrations.rotateApiKey(req.user.id, id);
      },
    );
    await this.render(
      req,
      res,
      'keys',
      { integrationId: id },
      {
        secret: result.apiKey,
        secretIntegrationId: id,
        message: 'Secret key rotated. The previous secret key no longer works.',
      },
    );
  }

  @Post('integrations/:id/revoke')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DashboardSensitiveDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    await this.dashboard.owned(req.user.id, id);
    await this.dashboard.reauthenticate(req.user.id, dto.password);
    await this.dashboard.withMutationLock(req.user.id, () =>
      this.integrations.revoke(req.user.id, id),
    );
    res.redirect(
      303,
      `/api/dashboard/settings?integrationId=${encodeURIComponent(id)}`,
    );
  }

  @Post('integrations/:id/rotate-webhook-secret')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async rotateWebhookSecret(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DashboardSensitiveDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    await this.dashboard.owned(req.user.id, id);
    await this.dashboard.reauthenticate(req.user.id, dto.password);
    const result = await this.dashboard.withMutationLock(
      req.user.id,
      async () => {
        await this.subscriptions.assertUserHasCapability(
          req.user.id,
          'website_linking',
        );
        const owned = await this.dashboard.owned(req.user.id, id);
        if (!owned.isActive)
          throw new BadRequestException(
            'Revoked integrations cannot rotate signing secrets.',
          );
        return this.integrations.rotateWebhookSigningSecret(req.user.id, id);
      },
    );
    await this.render(
      req,
      res,
      'webhooks',
      { integrationId: id },
      {
        webhookSecret: result.webhookSigningSecret,
        secretIntegrationId: id,
        message:
          'Webhook signing secret rotated. Update your endpoint before processing new deliveries.',
      },
    );
  }

  @Post('integrations/:id/webhooks/:deliveryId/retry')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async retryWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: DashboardFormDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    await this.dashboard.withMutationLock(req.user.id, () =>
      this.dashboard.retryWebhook(req.user.id, id, deliveryId),
    );
    res.redirect(
      303,
      `/api/dashboard/webhooks?integrationId=${encodeURIComponent(id)}`,
    );
  }

  @Post('checkout')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async checkout(
    @Body() dto: DashboardCheckoutDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    if (dto.planSlug !== 'web')
      throw new BadRequestException(
        'Manage bank-connection plans in the MyTrackr app.',
      );
    const status = await this.subscriptions.getUserSubscriptionStatus(
      req.user.id,
    );
    if (
      status.hasActiveSubscription &&
      planHasCapability(status.activePlan, 'website_linking')
    ) {
      throw new BadRequestException(
        'Your current subscription already includes website integration access.',
      );
    }
    const result = await this.dashboard.withMutationLock(req.user.id, () =>
      this.subscriptions.initializeSubscription(req.user as any, {
        planSlug: 'web',
        interval: 'monthly',
      }),
    );
    res.redirect(303, this.security.checkoutUrl(result.authorizationUrl));
  }

  @Post('verify-payment')
  async verify(
    @Body() dto: DashboardVerifyPaymentDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    await this.subscriptions.verifySubscriptionPayment(
      req.user.id,
      dto.reference,
    );
    res.redirect(303, '/api/dashboard/billing');
  }

  @Post('logout')
  async logout(
    @Body() dto: DashboardFormDto,
    @Req() req: DashboardRequest,
    @Res() res: Response,
  ) {
    await this.consume(req, dto.csrf);
    await this.auth.logoutSession(req.user.sessionId);
    await this.security.forgetSession(req.user.sessionId);
    this.security.clearTokens(res);
    res.redirect(303, '/api/dashboard/login');
  }
}
