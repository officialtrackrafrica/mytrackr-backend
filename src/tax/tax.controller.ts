import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
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
import { TaxService } from './services/tax.service';

@ApiTags('Tax')
@Controller('tax')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiBearerAuth()
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('estimate')
  @ApiOperation({
    summary: 'Calculate tax estimate',
    description:
      'Calculates both PIT (sole proprietor) and CIT (LLC) tax estimates for a business (or all businesses). Includes year-to-date projection.',
  })
  @ApiQuery({ name: 'businessId', required: false, type: String })
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
  @ApiResponse({ status: 200, description: 'Tax estimate with PIT and CIT' })
  async getTaxEstimate(
    @Req() req: any,
    @Query('businessId') businessId?: string,
    @Query('year') year?: string,
    @Query('deductions') deductions?: string,
  ) {
    const yearNumber = parseInt(year || '', 10);
    if (!year || isNaN(yearNumber)) {
      throw new BadRequestException('Valid tax year is required');
    }

    return this.taxService.calculateTaxEstimate(
      req.user.id,
      businessId || null,
      yearNumber,
      deductions ? parseFloat(deductions) : 0,
    );
  }
}
