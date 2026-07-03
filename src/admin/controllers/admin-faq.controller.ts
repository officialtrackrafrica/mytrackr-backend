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
import { AdminFaqService } from '../services/admin-faq.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { CreateFaqDto, FaqQueryDto, UpdateFaqDto } from '../dto';

@ApiTags('Admin - FAQ Management')
@ApiCookieAuth('accessToken')
@Controller('admin/faqs')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminFaqController {
  constructor(
    private readonly faqService: AdminFaqService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List FAQs with search and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated FAQs' })
  async listFaqs(@Query() query: FaqQueryDto) {
    return this.faqService.listFaqs(query);
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get FAQ details' })
  @ApiResponse({ status: 200, description: 'FAQ details' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  async getFaq(@Param('id') id: string) {
    return this.faqService.getFaq(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create FAQ' })
  @ApiBody({ type: CreateFaqDto })
  @ApiResponse({ status: 201, description: 'FAQ created' })
  async createFaq(@Body() dto: CreateFaqDto, @Req() req: any) {
    const result = await this.faqService.createFaq(req.user.id, dto);
    await this.auditService.log(
      'FAQ_CREATED',
      'Faq',
      result.id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update FAQ' })
  @ApiBody({ type: UpdateFaqDto })
  @ApiResponse({ status: 200, description: 'FAQ updated' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  async updateFaq(
    @Param('id') id: string,
    @Body() dto: UpdateFaqDto,
    @Req() req: any,
  ) {
    const result = await this.faqService.updateFaq(id, req.user.id, dto);
    await this.auditService.log(
      'FAQ_UPDATED',
      'Faq',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Delete FAQ' })
  @ApiResponse({ status: 200, description: 'FAQ deleted' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  async deleteFaq(@Param('id') id: string, @Req() req: any) {
    const result = await this.faqService.deleteFaq(id);
    await this.auditService.log(
      'FAQ_DELETED',
      'Faq',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }
}
