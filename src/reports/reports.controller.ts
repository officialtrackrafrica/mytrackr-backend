import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
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
@ApiCookieAuth('accessToken')
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
      "Calculates P&L for the user's business within a date range. Excludes uncategorised and INTERNAL_TRANSFER transactions.",
  })
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
    @Req() req: any,
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

    return this.pnlService.calculatePnl(req.user.id, start, end);
  }

  @Get('cash-flow')
  @ApiOperation({
    summary: 'Generate Cash Flow statement',
    description:
      "Calculates cash flow for the user's business including runway and burn rate. Includes ALL transactions.",
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Cash flow statement data' })
  async getCashFlow(
    @Req() req: any,
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

    return this.cashFlowService.calculateCashFlow(req.user.id, start, end);
  }

  @Get('balance-sheet')
  @ApiOperation({
    summary: 'Generate Balance Sheet',
    description:
      "Calculates assets, liabilities, and owner equity for the user's business.",
  })
  @ApiResponse({ status: 200, description: 'Balance sheet data' })
  async getBalanceSheet(@Req() req: any) {
    return this.balanceSheetService.calculateBalanceSheet(req.user.id);
  }
}
