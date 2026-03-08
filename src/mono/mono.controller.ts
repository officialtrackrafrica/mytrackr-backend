import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  UseGuards,
  Req,
  HttpCode,
  Headers,
  Query,
  Param,
} from '@nestjs/common';
import { PoliciesGuard } from '../casl/guards/policies.guard';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { Action } from '../casl/action.enum';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { MonoService } from './mono.service';
import {
  InitiateAccountDto,
  CreditworthinessDto,
  ReauthAccountDto,
  UpdateTransactionCategoryDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards';

@ApiTags('Mono')
@Controller('mono')
export class MonoController {
  constructor(private readonly monoService: MonoService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate Mono account linking' })
  @ApiResponse({
    status: 201,
    description: 'Returns Mono URL and session info',
  })
  async initiate(@Req() req: any, @Body() dto: InitiateAccountDto) {
    return this.monoService.initiateAccountLinking(req.user, dto);
  }

  @Post('reauth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-authenticate an existing Mono account' })
  @ApiResponse({
    status: 201,
    description: 'Returns Mono URL and session info for revalidation',
  })
  async reauth(@Req() req: any, @Body() dto: ReauthAccountDto) {
    return this.monoService.reauthenticateAccount(req.user.id, dto);
  }

  @Get('all-accounts')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all Mono accounts (Admin only)' })
  @ApiResponse({ status: 200, description: 'All business Mono accounts' })
  async getAllAccounts() {
    return this.monoService.getAllPlatformAccounts();
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all linked accounts for the authenticated user',
    description:
      "Fetches the authenticated user's saved mono accounts from the database.",
  })
  @ApiResponse({
    status: 200,
    description: 'List of user linked bank accounts',
  })
  async getLinkedAccounts(@Req() req: any) {
    return this.monoService.getUserLinkedAccounts(req.user.id);
  }

  @Get('user/statements')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get statements for all linked accounts of the authenticated user',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    type: Number,
    description: 'Number of months to retrieve (default: 1)',
  })
  @ApiHeader({
    name: 'x-realtime',
    required: false,
    description: 'Set to true to force a live sync from the bank',
  })
  async getAllUserStatements(
    @Req() req: any,
    @Query('months') months?: number,
    @Headers('x-realtime') realtime?: string,
  ) {
    return this.monoService.getAllUserStatements(
      req.user.id,
      months,
      realtime === 'true',
    );
  }

  @Get('user/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get transactions for all linked accounts (synced from cache)',
    description:
      'Performs on-demand delta sync, then returns cached transactions from the database. ' +
      'Supports date range queries. If the requested range extends beyond what is cached, ' +
      'it will backfill from Mono automatically.',
  })
  @ApiQuery({
    name: 'start',
    required: false,
    type: String,
    description: 'Start date (DD-MM-YYYY or YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'end',
    required: false,
    type: String,
    description: 'End date (DD-MM-YYYY or YYYY-MM-DD)',
  })
  @ApiHeader({
    name: 'x-force-sync',
    required: false,
    description: 'Set to true to force a full re-sync from Jan 1',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached transaction history for all accounts',
  })
  async getAllUserTransactions(
    @Req() req: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Headers('x-force-sync') forceSync?: string,
  ) {
    return this.monoService.getAllUserTransactions(
      req.user.id,
      start,
      end,
      forceSync === 'true',
    );
  }

  @Post('user/transactions/categorise')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Categorise all user transactions across linked accounts',
  })
  async categoriseTransactions(@Req() req: any) {
    return this.monoService.categoriseAllUserTransactions(req.user.id);
  }

  // ─── Manual Category Override ───────────────────────────────────────

  @Patch('user/transactions/:id/category')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Override the category of a specific transaction',
    description:
      'Manually set a category for a transaction. This override takes precedence over the Mono-assigned category ' +
      'and will persist through future syncs.',
  })
  @ApiParam({ name: 'id', description: 'Transaction ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
  })
  async updateTransactionCategory(
    @Req() req: any,
    @Param('id') transactionId: string,
    @Body() dto: UpdateTransactionCategoryDto,
  ) {
    return this.monoService.updateTransactionCategory(
      req.user.id,
      transactionId,
      dto.category,
    );
  }

  @Delete('user/transactions/:id/category')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reset a transaction category override',
    description:
      "Removes the manual category override and reverts to Mono's assigned category.",
  })
  @ApiParam({ name: 'id', description: 'Transaction ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Category override removed',
  })
  async resetTransactionCategory(
    @Req() req: any,
    @Param('id') transactionId: string,
  ) {
    return this.monoService.resetTransactionCategory(
      req.user.id,
      transactionId,
    );
  }

  // ─── Enrichment ─────────────────────────────────────────────────────

  @Post('user/transactions/metadata')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Enrich all user transactions with metadata',
    description:
      'Triggers metadata enrichment (merchant info, logos, etc.) for all linked accounts. ' +
      'Results arrive asynchronously via webhook.',
  })
  async enrichMetadata(@Req() req: any) {
    const accounts = await this.monoService.getUserLinkedAccounts(req.user.id);
    if (!accounts.length) return { message: 'No linked accounts found' };

    const results = await Promise.all(
      accounts.map(async (acc) => {
        try {
          const res = await this.monoService.enrichTransactionMetadata(
            acc.monoAccountId,
          );
          return { monoAccountId: acc.monoAccountId, data: res };
        } catch (error) {
          return { monoAccountId: acc.monoAccountId, error: error.message };
        }
      }),
    );

    return { totalAccounts: accounts.length, enrichment: results };
  }

  // ─── Job Tracking ──────────────────────────────────────────────────

  @Get('enrichment/jobs/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check the status of an enrichment job',
    description: 'Returns the current/final status of a data enrichment job.',
  })
  @ApiParam({ name: 'id', description: 'Job ID returned by enrichment APIs' })
  async getJobStatus(@Param('id') jobId: string) {
    return this.monoService.getEnrichmentJobStatus(jobId);
  }

  @Get('enrichment/records/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get enrichment records for a specific job',
    description:
      'Returns all data enrichment records produced by a particular job.',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  async getEnrichmentRecords(@Param('jobId') jobId: string) {
    return this.monoService.getEnrichmentRecords(jobId);
  }

  // ─── Credits / Debits / Income / Creditworthiness ──────────────────

  @Get('user/credits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get total credits history for all linked accounts',
  })
  async getCredits(@Req() req: any) {
    return this.monoService.getAllUserCredits(req.user.id);
  }

  @Get('user/debits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get total debits history for all linked accounts' })
  async getDebits(@Req() req: any) {
    return this.monoService.getAllUserDebits(req.user.id);
  }

  @Get('user/income')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request income analysis for all linked accounts',
    description:
      'Triggers income analysis. The result is delivered asynchronously via webhook.',
  })
  @ApiResponse({ status: 200, description: 'Income request accepted' })
  async getIncome(@Req() req: any) {
    return this.monoService.getAllUserIncome(req.user.id);
  }

  @Post('user/creditworthiness')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Assess creditworthiness for all linked accounts',
    description:
      'Triggers a creditworthiness check. The result is delivered asynchronously via webhook.',
  })
  @ApiResponse({
    status: 201,
    description: 'Creditworthiness request accepted',
  })
  async getCreditworthiness(@Req() req: any, @Body() dto: CreditworthinessDto) {
    return this.monoService.getAllUserCreditworthiness(req.user.id, dto);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive Mono webhook events',
    description:
      'Public endpoint called by Mono servers. Secured via mono-webhook-secret header verification.',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  @ApiResponse({ status: 401, description: 'Invalid webhook secret' })
  async handleWebhook(
    @Headers('mono-webhook-secret') webhookSecret: string,
    @Body() payload: { event: string; data: any },
  ) {
    this.monoService.verifyWebhookSecret(webhookSecret);
    return this.monoService.handleWebhookEvent(payload);
  }
}
