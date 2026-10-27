import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  UseGuards,
  Req,
  Headers,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiHeader,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { TransactionSyncResponseDto } from './dto/transaction-sync-response.dto';
import { MonoService } from './mono.service';
import {
  CreditworthinessDto,
  UpdateTransactionCategoryDto,
  MonoTransactionSummaryResponseDto,
} from './dto';
import { SWAGGER_TAGS } from '../common/docs';
import { JwtAuthGuard } from '../auth/guards';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { RequireCapability } from '../common/access-control/decorators/require-capability.decorator';
import { SubscriptionService } from '../payments/services/subscription.service';

@ApiTags(SWAGGER_TAGS[5].name) // 'Finance' tag
@Controller('finance')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class MonoFinanceController {
  constructor(
    private readonly monoService: MonoService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('linked-accounts/transactions')
  @ApiExtraModels(TransactionSyncResponseDto)
  @ApiOperation({
    summary: 'Get transactions for all linked accounts (synced from cache)',
    description:
      'Requests a real-time bank refresh, then returns synced transactions from the database. ' +
      'Returns saved transactions with sync.status=processing while Mono refreshes. ' +
      'When Mono confirms reauthorization is required, returns sync.status=reauthorization_required and sync.requiresReauthorization=true. Navigate to a reauthorizationUrl in sync.accounts. If null, retry to generate a link. A webhook received later is reflected on the next history request. ' +
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
  @ApiQuery({
    name: 'autoCategorize',
    required: false,
    type: Boolean,
    example: false,
    description:
      'Set to true to auto-categorize synced linked-account transactions',
  })
  @ApiHeader({
    name: 'x-force-sync',
    required: false,
    description: 'Set to true to request a bank refresh and re-import transactions from Jan 1',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached transaction history for all accounts',
    schema: {
      type: 'object',
      properties: {
        sync: { $ref: getSchemaPath(TransactionSyncResponseDto) },
      },
      additionalProperties: true,
    },
  })
  async getAllUserTransactions(
    @Req() req: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('autoCategorize') autoCategorize?: string,
    @Headers('x-force-sync') forceSync?: string,
  ) {
    if (autoCategorize === 'true') {
      await this.subscriptionService.assertUserHasCapability(
        req.user.id,
        'automatic_categorization',
      );
    }
    return this.monoService.getAllUserTransactions(
      req.user.id,
      start,
      end,
      forceSync === 'true',
      autoCategorize === 'true',
    );
  }

  @Post('linked-accounts/transactions/categorise')
  @RequireCapability('automatic_categorization')
  @ApiOperation({
    summary: 'Categorise all user transactions across linked accounts',
  })
  async categoriseTransactions(@Req() req: any) {
    return this.monoService.categoriseAllUserTransactions(req.user.id);
  }

  @Patch('linked-accounts/transactions/:id/category')
  @ApiOperation({
    summary: 'Manually set the category of a specific transaction',
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
      dto,
    );
  }

  @Delete('linked-accounts/transactions/:id/category')
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

  @Get('linked-accounts/credits')
  @ApiOperation({
    summary: 'Get total credits history for all linked accounts',
  })
  @ApiResponse({
    status: 200,
    description: 'Total credits summary',
    type: MonoTransactionSummaryResponseDto,
  })
  async getCredits(@Req() req: any) {
    return this.monoService.getAllUserCredits(req.user.id);
  }

  @Get('linked-accounts/debits')
  @ApiOperation({ summary: 'Get total debits history for all linked accounts' })
  @ApiResponse({
    status: 200,
    description: 'Total debits summary',
    type: MonoTransactionSummaryResponseDto,
  })
  async getDebits(@Req() req: any) {
    return this.monoService.getAllUserDebits(req.user.id);
  }

  @Get('linked-accounts/income')
  @ApiOperation({
    summary: 'Request income analysis for all linked accounts',
    description:
      'Triggers income analysis. The result is delivered asynchronously via webhook.',
  })
  @ApiResponse({ status: 200, description: 'Income request accepted' })
  async getIncome(@Req() req: any) {
    return this.monoService.getAllUserIncome(req.user.id);
  }

  @Post('linked-accounts/creditworthiness')
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
}
