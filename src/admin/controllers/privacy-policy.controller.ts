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
import { AdminPrivacyPolicyService } from '../services/admin-privacy-policy.service';
import {
  CreatePrivacyPolicyDto,
  PrivacyPolicyHistoryQueryDto,
  PublishPrivacyPolicyDto,
  UpdatePrivacyPolicyDto,
} from '../dto/privacy-policy.dto';

@ApiTags('Legal')
@Controller('legal/privacy-policy')
export class PrivacyPolicyController {
  constructor(private readonly policyService: AdminPrivacyPolicyService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get the currently effective privacy policy' })
  @ApiResponse({ status: 200, description: 'Current Privacy Policy' })
  @ApiResponse({ status: 404, description: 'No effective published policy' })
  getCurrentPolicy() {
    return this.policyService.getCurrentPolicy();
  }
}

@ApiTags('Admin - Legal')
@ApiCookieAuth('accessToken')
@Controller('admin/legal/privacy-policies')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminPrivacyPolicyController {
  constructor(
    private readonly policyService: AdminPrivacyPolicyService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List Privacy Policy version history' })
  listPolicies(@Query() query: PrivacyPolicyHistoryQueryDto) {
    return this.policyService.listPolicies(query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create a new privacy policy draft version' })
  @ApiBody({ type: CreatePrivacyPolicyDto })
  async createPolicy(@Body() dto: CreatePrivacyPolicyDto, @Req() req: any) {
    const result = await this.policyService.createPolicy(req.user.id, dto);
    await this.auditService.log(
      'PRIVACY_POLICY_CREATED',
      'PrivacyPolicyDocument',
      result.id,
      req.user.id,
      { version: result.version },
      req.ip,
    );
    return result;
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Edit a privacy policy draft' })
  @ApiBody({ type: UpdatePrivacyPolicyDto })
  async updatePolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrivacyPolicyDto,
    @Req() req: any,
  ) {
    const result = await this.policyService.updatePolicy(id, req.user.id, dto);
    await this.auditService.log(
      'PRIVACY_POLICY_UPDATED',
      'PrivacyPolicyDocument',
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
  @ApiOperation({ summary: 'Publish a privacy policy draft' })
  @ApiBody({ type: PublishPrivacyPolicyDto })
  async publishPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishPrivacyPolicyDto,
    @Req() req: any,
  ) {
    const result = await this.policyService.publishPolicy(id, req.user.id, dto);
    await this.auditService.log(
      'PRIVACY_POLICY_PUBLISHED',
      'PrivacyPolicyDocument',
      id,
      req.user.id,
      { version: result.version, effectiveAt: result.effectiveAt },
      req.ip,
    );
    return result;
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Delete a privacy policy draft' })
  async deletePolicy(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const result = await this.policyService.deletePolicy(id);
    await this.auditService.log(
      'PRIVACY_POLICY_DELETED',
      'PrivacyPolicyDocument',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }
}
