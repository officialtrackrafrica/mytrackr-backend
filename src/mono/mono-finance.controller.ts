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
} from '@nestjs/swagger';
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

@ApiTags(SWAGGER_TAGS[5].name) // 'Finance' tag
@Controller('finance')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class MonoFinanceController {
  constructor(private readonly monoService: MonoService) {}

  @Get('linked-accounts/transactions')
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

  @Post('linked-accounts/transactions/categorise')
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
