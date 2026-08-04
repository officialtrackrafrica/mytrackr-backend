import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminAuditService } from '../services/admin-audit.service';
import { LearningHubService } from '../services/learning-hub.service';
import {
  CreateLearningHubArticleDto,
  LearningHubQueryDto,
  UpdateLearningHubArticleDto,
} from '../dto/learning-hub.dto';

@ApiTags('Learning Hub')
@Controller('learning-hub')
export class LearningHubController {
  constructor(private readonly learningHubService: LearningHubService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List Learning Hub articles' })
  listArticles(@Query() query: LearningHubQueryDto) {
    return this.learningHubService.listArticles(query);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'List Learning Hub categories' })
  listCategories() {
    return this.learningHubService.listCategories();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a Learning Hub article' })
  getArticle(@Param('id', ParseUUIDPipe) id: string) {
    return this.learningHubService.getArticle(id);
  }
}

@ApiTags('Admin - Learning Hub')
@ApiCookieAuth('accessToken')
@Controller('admin/learning-hub')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminLearningHubController {
  constructor(
    private readonly learningHubService: LearningHubService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List Learning Hub articles for administration' })
  listArticles(@Query() query: LearningHubQueryDto) {
    return this.learningHubService.listArticles(query);
  }

  @Get('categories')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List Learning Hub categories' })
  listCategories() {
    return this.learningHubService.listCategories();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get a Learning Hub article for administration' })
  getArticle(@Param('id', ParseUUIDPipe) id: string) {
    return this.learningHubService.getArticle(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create a Learning Hub article' })
  @ApiBody({ type: CreateLearningHubArticleDto })
  async createArticle(
    @Body() dto: CreateLearningHubArticleDto,
    @Req() req: any,
  ) {
    const result = await this.learningHubService.createArticle(
      req.user.id,
      dto,
    );
    await this.auditService.log(
      'LEARNING_HUB_ARTICLE_CREATED',
      'LearningHubArticle',
      result.id,
      req.user.id,
      { title: result.title, category: result.category },
      req.ip,
    );
    return result;
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'Edit a Learning Hub article or change its category',
  })
  @ApiBody({ type: UpdateLearningHubArticleDto })
  async updateArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLearningHubArticleDto,
    @Req() req: any,
  ) {
    const result = await this.learningHubService.updateArticle(
      id,
      req.user.id,
      dto,
    );
    await this.auditService.log(
      'LEARNING_HUB_ARTICLE_UPDATED',
      'LearningHubArticle',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Delete a Learning Hub article' })
  async deleteArticle(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const result = await this.learningHubService.deleteArticle(id);
    await this.auditService.log(
      'LEARNING_HUB_ARTICLE_DELETED',
      'LearningHubArticle',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }
}
