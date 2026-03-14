import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { PnlService } from './services/pnl.service';
import { CashFlowService } from './services/cash-flow.service';
import { BalanceSheetService } from './services/balance-sheet.service';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiBearerAuth()
export class ReportsController {
  constructor(
    private readonly pnlService: PnlService,
    private readonly cashFlowService: CashFlowService,
    private readonly balanceSheetService: BalanceSheetService,
  ) {}

  @Get('pnl')
  @ApiOperation({
    summary: 'Generate Profit & Loss statement',
    description:
      'Calculates P&L for a business within a date range. Excludes uncategorised and INTERNAL_TRANSFER transactions.',
  })
  @ApiQuery({ name: 'businessId', required: true, type: String })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'ISO date string e.g. 2025-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'ISO date string e.g. 2025-12-31',
  })
  @ApiResponse({ status: 200, description: 'P&L statement data' })
  async getPnl(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!startDate || isNaN(start.getTime())) {
      throw new BadRequestException('Invalid or missing startDate');
    }
    if (!endDate || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid or missing endDate');
    }

    return this.pnlService.calculatePnl(businessId, start, end);
  }

  @Get('cash-flow')
  @ApiOperation({
    summary: 'Generate Cash Flow statement',
    description:
      'Calculates cash flow including runway and burn rate. Includes ALL transactions (categorised + uncategorised).',
  })
  @ApiQuery({ name: 'businessId', required: true, type: String })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Cash flow statement data' })
  async getCashFlow(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!startDate || isNaN(start.getTime())) {
      throw new BadRequestException('Invalid or missing startDate');
    }
    if (!endDate || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid or missing endDate');
    }

    return this.cashFlowService.calculateCashFlow(businessId, start, end);
  }

  @Get('balance-sheet')
  @ApiOperation({
    summary: 'Generate Balance Sheet',
    description:
      'Calculates assets, liabilities, and owner equity (capital + retained profit - drawings).',
  })
  @ApiQuery({ name: 'businessId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Balance sheet data' })
  async getBalanceSheet(@Query('businessId') businessId: string) {
    return this.balanceSheetService.calculateBalanceSheet(businessId);
  }
}
