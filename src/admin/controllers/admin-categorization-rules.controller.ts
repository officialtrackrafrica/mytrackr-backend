import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminCategorizationRulesService } from '../services/admin-categorization-rules.service';
import {
  CategorizationRuleQueryDto,
  CreateAdminCategorizationRuleDto,
  UpdateAdminCategorizationRuleDto,
} from '../dto';

@ApiTags('Admin - Categorization Rules')
@ApiCookieAuth('accessToken')
@Controller('admin/categorization-rules')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminCategorizationRulesController {
  constructor(
    private readonly rulesService: AdminCategorizationRulesService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List categorization rules grouped by category' })
  @ApiResponse({ status: 200, description: 'Paginated categorization rules' })
  async listRules(@Query() query: CategorizationRuleQueryDto) {
    return this.rulesService.listRules(query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create categorization rule keywords for a category' })
  @ApiBody({ type: CreateAdminCategorizationRuleDto })
  @ApiResponse({ status: 201, description: 'Categorization rule created' })
  async createRule(
    @Body() dto: CreateAdminCategorizationRuleDto,
    @Req() req: any,
  ) {
    const result = await this.rulesService.createRule(dto);
    await this.auditService.log(
      'CATEGORIZATION_RULE_CREATED',
      'CategorizationRule',
      result.id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update a categorization rule group' })
  @ApiBody({ type: UpdateAdminCategorizationRuleDto })
  @ApiResponse({ status: 200, description: 'Categorization rule updated' })
  @ApiResponse({ status: 404, description: 'Categorization rule not found' })
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateAdminCategorizationRuleDto,
    @Req() req: any,
  ) {
    const result = await this.rulesService.updateRuleGroup(id, dto);
    await this.auditService.log(
      'CATEGORIZATION_RULE_UPDATED',
      'CategorizationRule',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Delete a categorization rule group' })
  @ApiResponse({ status: 200, description: 'Categorization rule deleted' })
  @ApiResponse({ status: 404, description: 'Categorization rule not found' })
  async deleteRule(@Param('id') id: string, @Req() req: any) {
    const result = await this.rulesService.deleteRuleGroup(id);
    await this.auditService.log(
      'CATEGORIZATION_RULE_DELETED',
      'CategorizationRule',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }
}
