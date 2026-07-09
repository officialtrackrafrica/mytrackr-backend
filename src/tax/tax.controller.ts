import { Controller, Get, Query, UseGuards, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiResponse,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { TaxService } from './services/tax.service';
import { UserTaxDeductions } from './services/tax.service';
import { TaxEstimateResponseDto } from './dto/tax.dto';
import { SWAGGER_TAGS } from '../common/docs';
import { AppException, ErrorResponseDto } from '../common/errors';
import { SimplePdfReportService } from '../common/reports/simple-pdf-report.service';

@ApiTags(SWAGGER_TAGS[6].name)
@Controller('tax')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class TaxController {
  constructor(
    private readonly taxService: TaxService,
    private readonly simplePdfReportService: SimplePdfReportService,
  ) {}

  @Get('estimate')
  @ApiOperation({
    summary: 'Calculate tax estimate',
    description:
      'Calculates both PIT (sole proprietor) and CIT (LLC) for the selected tax year so far, with a previous-month year-to-date comparison when available.',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    type: Number,
    description: 'Tax year e.g. 2025',
  })
  @ApiQuery({
    name: 'deductions',
    required: false,
    type: Number,
    description: 'User-specified deductions in Naira',
  })
  @ApiResponse({
    status: 200,
    description: 'Tax estimate with PIT and CIT',
    type: TaxEstimateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Valid tax year is required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Active subscription plan required',
    type: ErrorResponseDto,
  })
  async getTaxEstimate(
    @Req() req: any,
    @Query() query: Record<string, any>,
    @Query('year') year?: string,
    @Query('deductions') deductions?: string,
  ) {
    const yearNumber = parseInt(year || '', 10);
    if (!year || isNaN(yearNumber)) {
      throw AppException.badRequest(
        'Valid tax year is required',
        'TAX_INVALID_YEAR',
      );
    }

    return this.taxService.calculateTaxEstimate(
      req.user.id,
      yearNumber,
      this.parseDeductionsQuery(query, deductions),
    );
  }

  @Get('estimate/report.pdf')
  @ApiOperation({
    summary: 'Download tax estimate report as PDF',
    description:
      'Downloads PIT and CIT tax estimate details for the selected tax year.',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    type: Number,
    description: 'Tax year e.g. 2025',
  })
  @ApiQuery({
    name: 'deductions',
    required: false,
    type: Number,
    description: 'User-specified deductions in Naira',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file download' })
  async getTaxEstimatePdf(
    @Req() req: any,
    @Res() res: Response,
    @Query() query: Record<string, any>,
    @Query('year') year?: string,
    @Query('deductions') deductions?: string,
  ) {
    const yearNumber = parseInt(year || '', 10);
    if (!year || isNaN(yearNumber)) {
      throw AppException.badRequest(
        'Valid tax year is required',
        'TAX_INVALID_YEAR',
      );
    }

    const report = await this.taxService.calculateTaxEstimate(
      req.user.id,
      yearNumber,
      this.parseDeductionsQuery(query, deductions),
    );

    const lines = [
      `Tax Year: ${report.year}`,
      `Period: ${report.period.startDate.slice(0, 10)} to ${report.period.endDate.slice(0, 10)}`,
      '',
      this.formatAmountLine('Total Revenue', report.totalRevenue),
      this.formatAmountLine('Total COGS', report.totalCogs),
      this.formatAmountLine('Total Expenses', report.totalExpenses),
      this.formatAmountLine('Net Profit', report.netProfit),
      this.formatAmountLine('Total Assets', report.totalAssets),
      '',
      'DEDUCTIONS',
      this.formatAmountLine('Health Insurance', report.deductions.healthInsurance),
      this.formatAmountLine('Life Insurance', report.deductions.lifeInsurance),
      this.formatAmountLine('Pension', report.deductions.pension),
      this.formatAmountLine('Housing Fund', report.deductions.housingFund),
      this.formatAmountLine('Rent', report.deductions.rent),
      this.formatAmountLine('Extra', report.deductions.extra),
      this.formatAmountLine('Total Deductions', report.deductions.total),
      this.formatAmountLine('Taxable Profit', report.taxableProfit),
      '',
      'PERSONAL INCOME TAX',
      this.formatAmountLine(
        'Chargeable Income',
        report.pitCalculation.chargeableIncome,
      ),
      this.formatAmountLine(
        'Consolidated Relief Allowance',
        report.pitCalculation.consolidatedReliefAllowance,
      ),
      this.formatAmountLine(
        'Minimum Tax Floor',
        report.pitCalculation.minimumTaxFloor,
      ),
      this.formatAmountLine(
        'Estimated Annual PIT',
        report.pitCalculation.estimatedAnnualTax,
      ),
      this.formatAmountLine(
        'Monthly PIT Set Aside',
        report.pitCalculation.estimatedMonthlySetAside,
      ),
      `Minimum Tax Applied: ${
        report.pitCalculation.minimumTaxApplied ? 'Yes' : 'No'
      }`,
      '',
      'COMPANY INCOME TAX',
      `Company Size: ${report.citCalculation.companySize}`,
      `Tax Rate Applied: ${report.citCalculation.taxRateApplied}`,
      this.formatAmountLine(
        'Assessable Profit',
        report.citCalculation.assessableProfit,
      ),
      this.formatAmountLine(
        'Estimated Annual CIT',
        report.citCalculation.estimatedAnnualTax,
      ),
      `CIT Exempt: ${report.citCalculation.isExempt ? 'Yes' : 'No'}`,
    ];

    const pdf = this.simplePdfReportService.generate({
      title: 'MyTrackr Tax Estimate Report',
      lines,
    });

    const filename = `mytrackr-tax-estimate-${yearNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  }

  private parseDeductionsQuery(
    query: Record<string, any>,
    deductions?: string,
  ): number | UserTaxDeductions {
    if (deductions && typeof deductions !== 'object') {
      const parsed = parseFloat(deductions);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const expandedDeductions =
      deductions && typeof deductions === 'object'
        ? (deductions as Record<string, unknown>)
        : {};

    const structuredDeductions: UserTaxDeductions = {
      healthInsurance: this.parseMoney(
        expandedDeductions.healthInsurance ??
          query['deductions[healthInsurance]'],
      ),
      lifeInsurance: this.parseMoney(
        expandedDeductions.lifeInsurance ?? query['deductions[lifeInsurance]'],
      ),
      pension: this.parseMoney(
        expandedDeductions.pension ?? query['deductions[pension]'],
      ),
      housingFund: this.parseMoney(
        expandedDeductions.housingFund ?? query['deductions[housingFund]'],
      ),
      rent: this.parseMoney(
        expandedDeductions.rent ?? query['deductions[rent]'],
      ),
      extra: this.parseMoney(
        expandedDeductions.extra ?? query['deductions[extra]'],
      ),
    };

    return Object.values(structuredDeductions).some((value) => value > 0)
      ? structuredDeductions
      : 0;
  }

  private parseMoney(value: unknown): number {
    const parsed = parseFloat(String(value ?? '0'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private formatAmountLine(label: string, amount: number): string {
    return `${label.padEnd(34, '.')} ${this.formatMoney(amount)}`;
  }

  private formatMoney(amount: number): string {
    return `NGN ${Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
