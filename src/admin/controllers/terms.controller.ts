import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { Public } from '../../auth/decorators/public.decorator';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminTermsService } from '../services/admin-terms.service';
import {
  CreateTermsDto,
  PublishTermsDto,
  TermsHistoryQueryDto,
  UpdateTermsDto,
} from '../dto/terms.dto';

@ApiTags('Legal')
@Controller('legal/terms')
export class TermsController {
  constructor(private readonly termsService: AdminTermsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get the currently effective published terms' })
  @ApiResponse({ status: 200, description: 'Current Terms and Conditions' })
  @ApiResponse({ status: 404, description: 'No effective published terms' })
  getCurrentTerms() {
    return this.termsService.getCurrentTerms();
  }
}

@ApiTags('Admin - Legal')
@ApiCookieAuth('accessToken')
@Controller('admin/legal/terms')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminTermsController {
  constructor(
    private readonly termsService: AdminTermsService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List Terms and Conditions version history' })
  listTerms(@Query() query: TermsHistoryQueryDto) {
    return this.termsService.listTerms(query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create a new terms draft version' })
  @ApiBody({ type: CreateTermsDto })
  async createTerms(@Body() dto: CreateTermsDto, @Req() req: any) {
    const result = await this.termsService.createTerms(req.user.id, dto);
    await this.auditService.log(
      'TERMS_CREATED',
      'TermsDocument',
      result.id,
      req.user.id,
      { version: result.version },
      req.ip,
    );
    return result;
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Edit a terms draft' })
  @ApiBody({ type: UpdateTermsDto })
  async updateTerms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermsDto,
    @Req() req: any,
  ) {
    const result = await this.termsService.updateTerms(id, req.user.id, dto);
    await this.auditService.log(
      'TERMS_UPDATED',
      'TermsDocument',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Post(':id/publish')
  @HttpCode(200)
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Publish a terms draft' })
  @ApiBody({ type: PublishTermsDto })
  async publishTerms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishTermsDto,
    @Req() req: any,
  ) {
    const result = await this.termsService.publishTerms(id, req.user.id, dto);
    await this.auditService.log(
      'TERMS_PUBLISHED',
      'TermsDocument',
      id,
      req.user.id,
      { version: result.version, effectiveAt: result.effectiveAt },
      req.ip,
    );
    return result;
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Delete a terms draft' })
  async deleteTerms(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const result = await this.termsService.deleteTerms(id);
    await this.auditService.log(
      'TERMS_DELETED',
      'TermsDocument',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }
}
