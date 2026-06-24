import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { SWAGGER_TAGS } from '../../common/docs';
import {
  CreateIntegrationEventDto,
  IntegrationEventIngestResponseDto,
  IntegrationMetricsResponseDto,
  IntegrationMetricsQueryDto,
} from '../dto/integration-event.dto';
import {
  ConnectPaystackDto,
  PaystackConnectionResponseDto,
  PaystackSyncResponseDto,
  SyncPaystackDto,
} from '../dto/paystack-connection.dto';
import {
  CreateIntegrationDto,
  CreatedIntegrationResponseDto,
  IntegrationCheckoutResponseDto,
  IntegrationMessageResponseDto,
  IntegrationResponseDto,
  PublicIntegrationConfigDto,
  UpdateIntegrationDto,
} from '../dto/integration.dto';
import { IntegrationApiKeyGuard } from '../guards/integration-api-key.guard';
import { IntegrationsService } from '../services/integrations.service';

@ApiTags(SWAGGER_TAGS[11].name)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @Get()
  @ApiOperation({ summary: 'List website integrations for the current user' })
  @ApiResponse({ status: 200, type: [IntegrationResponseDto] })
  async list(@Req() req: any) {
    return this.integrationsService.list(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @Post()
  @ApiOperation({
    summary: 'Create a React, WordPress, or custom website integration',
  })
  @ApiBody({ type: CreateIntegrationDto })
  @ApiResponse({ status: 201, type: CreatedIntegrationResponseDto })
  async create(@Req() req: any, @Body() dto: CreateIntegrationDto) {
    return this.integrationsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiOperation({ summary: 'Update a website integration' })
  @ApiBody({ type: UpdateIntegrationDto })
  @ApiResponse({ status: 200, type: IntegrationResponseDto })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.integrationsService.update(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @Post(':id/checkout')
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiOperation({
    summary:
      'Deprecated checkout endpoint for integration API keys. Website integrations now use app subscriptions.',
  })
  @ApiResponse({ status: 201, type: IntegrationCheckoutResponseDto })
  async initializeCheckout(@Req() req: any, @Param('id') id: string) {
    return this.integrationsService.initializeCheckout(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @Post(':id/rotate-key')
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiOperation({ summary: 'Rotate an integration API key' })
  @ApiResponse({ status: 201, type: CreatedIntegrationResponseDto })
  async rotateApiKey(@Req() req: any, @Param('id') id: string) {
    return this.integrationsService.rotateApiKey(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiOperation({ summary: 'Revoke a website integration' })
  @ApiResponse({ status: 200, type: IntegrationMessageResponseDto })
  async revoke(@Req() req: any, @Param('id') id: string) {
    return this.integrationsService.revoke(req.user.id, id);
  }

  @Get('public/:publicKey/config')
  @ApiParam({ name: 'publicKey', description: 'Integration public key' })
  @ApiHeader({
    name: 'origin',
    required: false,
    description: 'Browser origin. Checked against allowedOrigins when set.',
  })
  @ApiOperation({
    summary: 'Get public integration config for React or WordPress embeds',
  })
  @ApiResponse({ status: 200, type: PublicIntegrationConfigDto })
  async getPublicConfig(
    @Param('publicKey') publicKey: string,
    @Headers('origin') origin?: string,
  ) {
    return this.integrationsService.getPublicConfig(publicKey, origin);
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Get('private/config')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({
    summary: 'Get private integration config for server-side plugins',
  })
  @ApiResponse({
    status: 200,
    description:
      'Private integration config, business metadata, and available app subscription plans',
  })
  async getPrivateConfig(@Req() req: any) {
    return this.integrationsService.getPrivateConfig(req.integration);
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Post('events')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({
    summary:
      'Ingest ecommerce events from React, WordPress, or custom websites',
  })
  @ApiBody({ type: CreateIntegrationEventDto })
  @ApiResponse({ status: 201, type: IntegrationEventIngestResponseDto })
  async ingestEvent(@Req() req: any, @Body() dto: CreateIntegrationEventDto) {
    return this.integrationsService.ingestEvent(req.integration, dto);
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Get('private/metrics')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({
    summary: 'Get ecommerce metrics tracked from website integration events',
  })
  @ApiResponse({ status: 200, type: IntegrationMetricsResponseDto })
  async getMetrics(
    @Req() req: any,
    @Query() query: IntegrationMetricsQueryDto,
  ) {
    return this.integrationsService.getMetrics(req.integration, query);
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Post('paystack/connect')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({
    summary: 'Store merchant Paystack secret key for direct ecommerce sync',
  })
  @ApiBody({ type: ConnectPaystackDto })
  @ApiResponse({ status: 201, type: PaystackConnectionResponseDto })
  async connectPaystack(@Req() req: any, @Body() dto: ConnectPaystackDto) {
    return this.integrationsService.connectPaystack(req.integration, dto);
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Get('paystack/connection')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({ summary: 'Get Paystack direct-sync connection status' })
  @ApiResponse({ status: 200, type: PaystackConnectionResponseDto })
  async getPaystackConnection(@Req() req: any) {
    return this.integrationsService.getPaystackConnection(req.integration);
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Post('paystack/sync')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({
    summary: 'Fetch Paystack transactions and import ecommerce inflow metrics',
  })
  @ApiBody({ type: SyncPaystackDto })
  @ApiResponse({ status: 201, type: PaystackSyncResponseDto })
  async syncPaystack(@Req() req: any, @Body() dto: SyncPaystackDto) {
    return this.integrationsService.syncPaystackTransactions(
      req.integration,
      dto,
    );
  }

  @UseGuards(IntegrationApiKeyGuard)
  @Delete('paystack/connection')
  @ApiHeader({ name: 'x-mytrackr-api-key', required: true })
  @ApiOperation({ summary: 'Disconnect Paystack direct sync' })
  @ApiResponse({ status: 200, type: IntegrationMessageResponseDto })
  async disconnectPaystack(@Req() req: any) {
    return this.integrationsService.disconnectPaystack(req.integration);
  }
}
