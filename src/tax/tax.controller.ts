import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
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
import { TaxService } from './services/tax.service';
import { UserTaxDeductions } from './services/tax.service';
import { TaxEstimateResponseDto } from './dto/tax.dto';
import { SWAGGER_TAGS } from '../common/docs';
import { AppException, ErrorResponseDto } from '../common/errors';

@ApiTags(SWAGGER_TAGS[6].name)
@Controller('tax')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

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
}
