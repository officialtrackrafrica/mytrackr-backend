import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Logger,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
import { Business } from '../business/entities/business.entity';
import { Asset } from './entities/asset.entity';
import { Liability, LiabilityStatus } from './entities/liability.entity';
import { CategorizationRule } from './entities/categorization-rule.entity';
import { Transaction } from './entities/transaction.entity';
import { CategorizationService } from './services/categorization.service';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import {
  CreateAssetDto,
  UpdateAssetDto,
  CreateLiabilityDto,
  UpdateLiabilityDto,
  CreateCategorizationRuleDto,
  UpdateCategorizationRuleDto,
  CreateTransactionDto,
} from './dto';

@ApiTags('Finance')
@Controller('finance')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiBearerAuth()
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Liability)
    private readonly liabilityRepository: Repository<Liability>,
    @InjectRepository(CategorizationRule)
    private readonly ruleRepository: Repository<CategorizationRule>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly categorizationService: CategorizationService,
  ) {}

  private async getBusinessIdsForUser(userId: string): Promise<string[]> {
    const businesses = await this.businessRepository.find({
      where: { userId },
      select: ['id'],
    });
    return businesses.map((b) => b.id);
  }

  @Get('assets')
  @ApiOperation({
    summary: 'List all assets for a business (or all businesses)',
  })
  @ApiQuery({ name: 'businessId', required: false, type: String })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  async listAssets(
    @Req() req: any,
    @Query('businessId') businessId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const where: any = {};
    if (businessId) {
      where.businessId = businessId;
    } else {
      where.businessId = In(await this.getBusinessIdsForUser(req.user.id));
    }

    if (includeArchived !== 'true') {
      where.isArchived = false;
    }
    return this.assetRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  @Post('assets')
  @ApiOperation({ summary: 'Create a new asset' })
  @ApiResponse({ status: 201, description: 'Asset created' })
  async createAsset(@Body() dto: CreateAssetDto) {
    const asset = this.assetRepository.create(dto);
    return this.assetRepository.save(asset);
  }

  @Patch('assets/:id')
  @ApiOperation({ summary: 'Update an asset' })
  async updateAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    await this.assetRepository.update(id, dto);
    return this.assetRepository.findOneBy({ id });
  }

  @Delete('assets/:id')
  @ApiOperation({ summary: 'Archive an asset (soft-delete)' })
  async archiveAsset(@Param('id', ParseUUIDPipe) id: string) {
    await this.assetRepository.update(id, { isArchived: true });
    return { message: 'Asset archived' };
  }

  @Get('liabilities')
  @ApiOperation({
    summary: 'List all liabilities for a business (or all businesses)',
  })
  @ApiQuery({ name: 'businessId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  async listLiabilities(
    @Req() req: any,
    @Query('businessId') businessId?: string,
    @Query('status') status?: string,
  ) {
    const where: any = {};
    if (businessId) {
      where.businessId = businessId;
    } else {
      where.businessId = In(await this.getBusinessIdsForUser(req.user.id));
    }

    if (status) {
      where.status = status;
    }
    return this.liabilityRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  @Post('liabilities')
  @ApiOperation({ summary: 'Create a new liability' })
  @ApiResponse({ status: 201, description: 'Liability created' })
  async createLiability(@Body() dto: CreateLiabilityDto) {
    const liability = this.liabilityRepository.create(dto);
    return this.liabilityRepository.save(liability);
  }

  @Patch('liabilities/:id')
  @ApiOperation({ summary: 'Update a liability' })
  async updateLiability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiabilityDto,
  ) {
    await this.liabilityRepository.update(id, dto);
    return this.liabilityRepository.findOneBy({ id });
  }

  @Delete('liabilities/:id')
  @ApiOperation({ summary: 'Archive a liability (soft-delete)' })
  async archiveLiability(@Param('id', ParseUUIDPipe) id: string) {
    await this.liabilityRepository.update(id, {
      status: LiabilityStatus.ARCHIVED,
    });
    return { message: 'Liability archived' };
  }

  @Get('categorization-rules')
  @ApiOperation({
    summary: 'List categorization rules for a business (or all businesses)',
  })
  @ApiQuery({ name: 'businessId', required: false, type: String })
  async listRules(@Req() req: any, @Query('businessId') businessId?: string) {
    const where: any = {};
    if (businessId) {
      where.businessId = businessId;
    } else {
      where.businessId = In(await this.getBusinessIdsForUser(req.user.id));
    }
    return this.ruleRepository.find({
      where,
      order: { priority: 'ASC' },
    });
  }

  @Post('categorization-rules')
  @ApiOperation({ summary: 'Create a categorization rule' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  async createRule(@Body() dto: CreateCategorizationRuleDto) {
    const rule = this.ruleRepository.create(dto);
    const savedRule = await this.ruleRepository.save(rule);

    const affected =
      await this.categorizationService.applyRuleRetroactively(savedRule);
    this.logger.log(
      `Rule ${savedRule.id} applied retroactively to ${affected} transactions`,
    );

    return { rule: savedRule, retroactivelyApplied: affected };
  }

  @Patch('categorization-rules/:id')
  @ApiOperation({ summary: 'Update a categorization rule' })
  async updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategorizationRuleDto,
  ) {
    await this.ruleRepository.update(id, dto);
    return this.ruleRepository.findOneBy({ id });
  }

  @Delete('categorization-rules/:id')
  @ApiOperation({ summary: 'Deactivate a categorization rule' })
  async deactivateRule(@Param('id', ParseUUIDPipe) id: string) {
    await this.ruleRepository.update(id, { isActive: false });
    return { message: 'Rule deactivated' };
  }

  @Post('transactions')
  @ApiOperation({
    summary: 'Create a manual transaction',
    description:
      'For users who skip bank connection. Creates a transaction in the finance table directly.',
  })
  @ApiResponse({ status: 201, description: 'Transaction created' })
  async createTransaction(@Body() dto: CreateTransactionDto) {
    const transaction = this.transactionRepository.create({
      ...dto,
      date: new Date(dto.date),
      isCategorised: !!dto.category,
    });
    return this.transactionRepository.save(transaction);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'List transactions for a business (or all businesses)',
  })
  @ApiQuery({ name: 'businessId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async listTransactions(
    @Req() req: any,
    @Query('businessId') businessId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const query = this.transactionRepository.createQueryBuilder('tx');

    if (businessId) {
      query.where('tx.businessId = :businessId', { businessId });
    } else {
      const businessIds = await this.getBusinessIdsForUser(req.user.id);
      if (businessIds.length > 0) {
        query.where('tx.businessId IN (:...businessIds)', { businessIds });
      } else {
        // Return empty if no businesses
        return [];
      }
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequestException('Invalid startDate or endDate');
      }

      query.andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate: start,
        endDate: end,
      });
    }

    return query.orderBy('tx.date', 'DESC').getMany();
  }
}
