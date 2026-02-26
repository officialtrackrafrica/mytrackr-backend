import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  Headers,
  Query,
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
} from '@nestjs/swagger';
import { MonoService } from './mono.service';
import {
  InitiateAccountDto,
  CreditworthinessDto,
  ReauthAccountDto,
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

  // ─── Webhook ───────────────────────────────────────────────────────

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
