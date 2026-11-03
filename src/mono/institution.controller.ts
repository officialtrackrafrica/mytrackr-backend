import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_TAGS } from '../common/docs';
import { PublicPlan } from '../common/access-control/decorators/public-plan.decorator';
import { SupportedInstitutionDto } from './dto/supported-institution.dto';
import { InstitutionService } from './institution.service';

@ApiTags(SWAGGER_TAGS[8].name)
@Controller('mono')
export class InstitutionController {
  constructor(private readonly institutions: InstitutionService) {}

  @Get('institutions')
  @PublicPlan()
  @ApiOperation({
    summary: 'List supported banks and account types before subscribing',
    description:
      'Public live Mono financial-data coverage. Each row is a supported institutionId/accountType pair. Account type is the banking category (for example personal/business), not a savings/current product guarantee.',
  })
  @ApiResponse({ status: 200, type: [SupportedInstitutionDto] })
  @ApiResponse({
    status: 503,
    description: 'Bank support is temporarily unavailable',
  })
  getSupportedInstitutions() {
    return this.institutions.getSupportedInstitutions();
  }
}
