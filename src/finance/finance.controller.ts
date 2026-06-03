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
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Req,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiResponse,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
import { Public } from '../auth/decorators/public.decorator';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { BusinessService } from '../business/services/business.service';
import { Asset, AssetCategory } from './entities/asset.entity';
import {
  Liability,
  LiabilityStatus,
  LiabilityType,
} from './entities/liability.entity';
import { Transaction, CategorySource } from './entities/transaction.entity';
import { AccountCategory } from './entities/account-category.entity';
import { AccountSubCategory } from './entities/account-subcategory.entity';
import { MonoTransaction } from '../mono/entities/transaction.entity';
import { CategorizationService } from './services/categorization.service';
import { CsvUploadService } from './services/csv-upload.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { BankAccountService } from './services/bank-account.service';
import { SWAGGER_TAGS } from '../common/docs';
import { AppException, ErrorResponseDto } from '../common/errors';
import {
  CreateAssetDto,
  UpdateAssetDto,
  CreateLiabilityDto,
  UpdateLiabilityDto,
  CreateTransactionDto,
  UpdateTransactionDto,
  AssetResponseDto,
  LiabilityResponseDto,
  LiabilityTypeOptionDto,
  TransactionResponseDto,
  ArchiveMessageResponseDto,
  CsvUploadResponseDto,
  TransactionQueryDto,
  PaginatedTransactionResponseDto,
  TransactionSummaryResponseDto,
  AccountCategoryResponseDto,
  AssetCategoryOptionDto,
  AssetQueryDto,
  LiabilityQueryDto,
  PaginatedAssetResponseDto,
  PaginatedLiabilityResponseDto,
} from './dto';

@ApiTags(SWAGGER_TAGS[5].name)
@Controller('finance')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('accessToken')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);
  private readonly assetCategoryOptions: AssetCategoryOptionDto[] = [
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1001',
      value: AssetCategory.CASH_BANK,
      label: AssetCategory.CASH_BANK,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1002',
      value: AssetCategory.CASH_HAND,
      label: AssetCategory.CASH_HAND,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1003',
      value: AssetCategory.INVENTORY,
      label: AssetCategory.INVENTORY,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1004',
      value: AssetCategory.RECEIVABLES,
      label: AssetCategory.RECEIVABLES,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1005',
      value: AssetCategory.LAND_BUILDINGS,
      label: AssetCategory.LAND_BUILDINGS,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1006',
      value: AssetCategory.EQUIPMENT,
      label: AssetCategory.EQUIPMENT,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1007',
      value: AssetCategory.FURNITURE,
      label: AssetCategory.FURNITURE,
    },
    {
      id: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1008',
      value: AssetCategory.OTHER,
      label: AssetCategory.OTHER,
    },
  ];
  private readonly liabilityTypeOptions: LiabilityTypeOptionDto[] = [
    {
      id: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2001',
      value: LiabilityType.BUSINESS_LOAN,
      label: LiabilityType.BUSINESS_LOAN,
    },
    {
      id: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2002',
      value: LiabilityType.COOPERATIVE_LOAN,
      label: LiabilityType.COOPERATIVE_LOAN,
    },
    {
      id: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2003',
      value: LiabilityType.FAMILY_LOAN,
      label: LiabilityType.FAMILY_LOAN,
    },
    {
      id: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2004',
      value: LiabilityType.SUPPLIER_DEBT,
      label: LiabilityType.SUPPLIER_DEBT,
    },
    {
      id: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2005',
      value: LiabilityType.OTHER,
      label: LiabilityType.OTHER,
    },
  ];

  constructor(
    private readonly businessService: BusinessService,
    private readonly csvUploadService: CsvUploadService,
    private readonly pdfUploadService: PdfUploadService,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Liability)
    private readonly liabilityRepository: Repository<Liability>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(MonoTransaction)
    private readonly monoTransactionRepository: Repository<MonoTransaction>,
    @InjectRepository(AccountCategory)
    private readonly categoryRepository: Repository<AccountCategory>,
    @InjectRepository(AccountSubCategory)
    private readonly subCategoryRepository: Repository<AccountSubCategory>,
    private readonly categorizationService: CategorizationService,
    private readonly bankAccountService: BankAccountService,
  ) {}

  @Get('assets/categories')
  @ApiOperation({ summary: 'List available asset categories' })
  @ApiResponse({
    status: 200,
    description: 'Available asset categories with stable IDs and values',
    type: [AssetCategoryOptionDto],
  })
  @Public()
  listAssetCategories() {
    return this.assetCategoryOptions;
  }

  @Get('assets')
  @ApiOperation({ summary: "List all assets for the user's business" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of assets',
    type: PaginatedAssetResponseDto,
  })
  async listAssets(@Req() req: any, @Query() queryDto: AssetQueryDto) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const { page = 1, limit = 20, includeArchived = false } = queryDto;
    const where: any = { businessId };

    if (!includeArchived) {
      where.isArchived = false;
    }

    const skip = (page - 1) * limit;
    const [assets, total] = await this.assetRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: assets.map((asset) => this.serializeAsset(asset)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Post('assets')
  @ApiOperation({ summary: 'Create a new asset' })
  @ApiResponse({
    status: 201,
    description: 'Asset created',
    type: AssetResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  async createAsset(@Body() dto: CreateAssetDto) {
    const category = this.resolveAssetCategory(dto.categoryId);
    const asset = this.assetRepository.create({
      ...dto,
      category,
    });
    const saved = await this.assetRepository.save(asset);
    return this.serializeAsset(saved);
  }

  @Patch('assets/:id')
  @ApiOperation({ summary: 'Update an asset' })
  @ApiResponse({
    status: 200,
    description: 'Asset updated',
    type: AssetResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Asset not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  async updateAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    const asset = await this.assetRepository.findOneBy({ id });
    if (!asset) {
      throw AppException.notFound('Asset not found', 'FINANCE_ASSET_NOT_FOUND');
    }
    const updateData: Partial<Asset> = { ...dto } as Partial<Asset>;
    if (dto.categoryId) {
      updateData.category = this.resolveAssetCategory(dto.categoryId);
    }
    delete (updateData as any).categoryId;

    await this.assetRepository.update(id, updateData);
    const updated = await this.assetRepository.findOneBy({ id });
    return updated ? this.serializeAsset(updated) : updated;
  }

  @Delete('assets/:id')
  @ApiOperation({ summary: 'Archive an asset (soft-delete)' })
  @ApiResponse({
    status: 200,
    description: 'Asset archived',
    type: ArchiveMessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Asset not found',
    type: ErrorResponseDto,
  })
  async archiveAsset(@Param('id', ParseUUIDPipe) id: string) {
    const asset = await this.assetRepository.findOneBy({ id });
    if (!asset) {
      throw AppException.notFound('Asset not found', 'FINANCE_ASSET_NOT_FOUND');
    }
    await this.assetRepository.update(id, { isArchived: true });
    return { message: 'Asset archived' };
  }

  @Get('liabilities/types')
  @ApiOperation({ summary: 'List available liability types' })
  @ApiResponse({
    status: 200,
    description: 'Available liability types with stable IDs and values',
    type: [LiabilityTypeOptionDto],
  })
  @Public()
  listLiabilityTypes() {
    return this.liabilityTypeOptions;
  }

  @Get('liabilities')
  @ApiOperation({ summary: "List all liabilities for the user's business" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: LiabilityStatus,
    example: LiabilityStatus.ACTIVE,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of liabilities',
    type: PaginatedLiabilityResponseDto,
  })
  async listLiabilities(
    @Req() req: any,
    @Query() queryDto: LiabilityQueryDto,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const { page = 1, limit = 20, status } = queryDto;
    const where: any = { businessId };

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;
    const [liabilities, total] = await this.liabilityRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: liabilities.map((liability) => this.serializeLiability(liability)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Post('liabilities')
  @ApiOperation({ summary: 'Create a new liability' })
  @ApiResponse({
    status: 201,
    description: 'Liability created',
    type: LiabilityResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  async createLiability(@Body() dto: CreateLiabilityDto) {
    const liabilityType = this.resolveLiabilityType(dto.liabilityTypeId);
    const liability = this.liabilityRepository.create({
      ...dto,
      liabilityType,
    });
    const saved = await this.liabilityRepository.save(liability);
    return this.serializeLiability(saved);
  }

  @Patch('liabilities/:id')
  @ApiOperation({ summary: 'Update a liability' })
  @ApiResponse({
    status: 200,
    description: 'Liability updated',
    type: LiabilityResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Liability not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  async updateLiability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiabilityDto,
  ) {
    const liability = await this.liabilityRepository.findOneBy({ id });
    if (!liability) {
      throw AppException.notFound(
        'Liability not found',
        'FINANCE_LIABILITY_NOT_FOUND',
      );
    }
    const updateData: Partial<Liability> = { ...dto } as Partial<Liability>;
    if (dto.liabilityTypeId) {
      updateData.liabilityType = this.resolveLiabilityType(dto.liabilityTypeId);
    }
    delete (updateData as any).liabilityTypeId;

    await this.liabilityRepository.update(id, updateData);
    const updated = await this.liabilityRepository.findOneBy({ id });
    return updated ? this.serializeLiability(updated) : updated;
  }

  @Delete('liabilities/:id')
  @ApiOperation({ summary: 'Archive a liability (soft-delete)' })
  @ApiResponse({
    status: 200,
    description: 'Liability archived',
    type: ArchiveMessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Liability not found',
    type: ErrorResponseDto,
  })
  async archiveLiability(@Param('id', ParseUUIDPipe) id: string) {
    const liability = await this.liabilityRepository.findOneBy({ id });
    if (!liability) {
      throw AppException.notFound(
        'Liability not found',
        'FINANCE_LIABILITY_NOT_FOUND',
      );
    }
    await this.liabilityRepository.update(id, {
      status: LiabilityStatus.ARCHIVED,
    });
    return { message: 'Liability archived' };
  }

  // --- Categories ---

  @Get('categories')
  @ApiOperation({
    summary: 'List all financial categories and subtypes',
    description:
      'Returns a hierarchical list of system-default categories used for transaction classification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Hierarchical list of categories',
    type: [AccountCategoryResponseDto],
  })
  @Public()
  async listCategories() {
    return this.categorizationService.listCategories();
  }

  // @Post('transactions/repair')
  // @ApiOperation({
  //   summary: 'Repair orphaned transactions',
  //   description:
  //     'Fixes all transactions that are missing a businessId or are uncategorised. ' +
  //     'Call this once to fix zero-value reports after linking a bank account.',
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Repair results',
  // })
  // async repairTransactions(@Req() req: any) {
  //   const businessId = await this.businessService.getBusinessIdForUser(
  //     req.user.id,
  //   );
  //   return this.categorizationService.repairOrphanedTransactions(
  //     businessId,
  //     req.user.id,
  //   );
  // }

  @Post('transactions')
  @ApiOperation({
    summary: 'Create a manual transaction',
    description:
      'Record a transaction manually — useful for cash payments, offline sales, etc. Bank Account ID is optional for cash transactions.',
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction created',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  async createTransaction(@Req() req: any, @Body() dto: CreateTransactionDto) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );

    let category: string | undefined;
    let subCategory: string | undefined;
    let categoryId: string | undefined = dto.categoryId;
    const subCategoryId: string | undefined = dto.subCategoryId;

    if (dto.categoryId) {
      const cat = await this.categoryRepository.findOneBy({
        id: dto.categoryId,
      });
      if (!cat) {
        throw AppException.badRequest(
          'Invalid categoryId — use GET /finance/categories to find valid IDs.',
          'FINANCE_INVALID_CATEGORY',
        );
      }
      category = cat.type;
    }

    if (dto.subCategoryId) {
      const sub = await this.subCategoryRepository.findOne({
        where: { id: dto.subCategoryId },
        relations: ['category'],
      });
      if (!sub) {
        throw AppException.badRequest(
          'Invalid subCategoryId — use GET /finance/categories to find valid IDs.',
          'FINANCE_INVALID_SUBCATEGORY',
        );
      }
      subCategory = sub.name;
      // If no categoryId was provided, auto-fill from the subcategory's parent
      if (!categoryId) {
        categoryId = sub.category.id;
        category = sub.category.type;
      }
    }

    const transaction = this.transactionRepository.create({
      date: new Date(dto.date),
      name: dto.name,
      amount: dto.amount,
      direction: dto.direction,
      description: dto.description,
      notes: dto.notes,
      businessId,
      userId: req.user.id,
      categoryId,
      subCategoryId,
      category,
      subCategory,
      manualCategory: category,
      manualSubCategory: subCategory,
      categorySource: category ? CategorySource.MANUAL : undefined,
      isCategorised: !!category,
      bankAccountId: dto.bankAccountId || undefined,
    });
    return this.transactionRepository.save(transaction);
  }

  @Patch('transactions/:id')
  @ApiOperation({ summary: 'Update a transaction (manual categorization)' })
  @ApiResponse({
    status: 200,
    description: 'Transaction updated',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
    type: ErrorResponseDto,
  })
  async updateTransaction(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const tx = await this.resolveFinanceTransaction(req.user.id, businessId, id);
    if (!tx) {
      throw AppException.notFound(
        'Transaction not found',
        'FINANCE_TRANSACTION_NOT_FOUND',
      );
    }

    let categoryId = dto.categoryId;
    const subCategoryId = dto.subCategoryId;
    let category: string | undefined;
    let subCategory: string | undefined;

    if (categoryId) {
      const cat = await this.categoryRepository.findOneBy({ id: categoryId });
      if (!cat) {
        throw AppException.badRequest(
          'Invalid categoryId',
          'FINANCE_INVALID_CATEGORY',
        );
      }
      category = cat.type;
    }

    if (subCategoryId) {
      const sub = await this.subCategoryRepository.findOne({
        where: { id: subCategoryId },
        relations: ['category'],
      });
      if (!sub) {
        throw AppException.badRequest(
          'Invalid subCategoryId',
          'FINANCE_INVALID_SUBCATEGORY',
        );
      }
      subCategory = sub.name;
      if (!categoryId) {
        categoryId = sub.category.id;
        category = sub.category.type;
      }
    }

    if (category && categoryId) {
      tx.categoryId = categoryId as any;
      tx.subCategoryId = subCategoryId as any;
      tx.category = category;
      tx.subCategory = subCategory as any;
      tx.manualCategory = category;
      tx.manualSubCategory = subCategory as any;
      tx.categorySource = CategorySource.MANUAL;
      tx.isCategorised = true;
    }

    if (dto.notes !== undefined) {
      tx.notes = dto.notes;
    }

    await this.transactionRepository.save(tx);
    return this.serializeTransaction(
      await this.transactionRepository.findOneBy({ id: tx.id }),
    );
  }

  @Delete('transactions/:id')
  @ApiOperation({
    summary:
      'Delete a transaction from history with suppression for linked-account records',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction soft-deleted',
    type: ArchiveMessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
    type: ErrorResponseDto,
  })
  async deleteTransaction(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );

    const tx = await this.resolveFinanceTransaction(req.user.id, businessId, id);
    if (!tx) {
      throw AppException.notFound(
        'Transaction not found',
        'FINANCE_TRANSACTION_NOT_FOUND',
      );
    }

    if (tx.externalId?.startsWith('mono_')) {
      const monoTransactionId = tx.externalId.slice(5);
      const monoTransaction = await this.monoTransactionRepository.findOne({
        where: { monoTransactionId },
        relations: ['monoAccount', 'monoAccount.user'],
      });

      if (!monoTransaction || monoTransaction.monoAccount?.user?.id !== req.user.id) {
        throw AppException.notFound(
          'Transaction not found',
          'FINANCE_TRANSACTION_NOT_FOUND',
        );
      }

      await this.monoTransactionRepository.softDelete(monoTransaction.id);
      await this.transactionRepository.softDelete(tx.id);

      return { message: 'Linked-account transaction deleted and suppressed' };
    }

    await this.transactionRepository.softDelete(tx.id);
    return { message: 'Transaction deleted' };
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      "List transactions for the user's business with pagination and filtering",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of transactions',
    type: PaginatedTransactionResponseDto,
  })
  async listTransactions(
    @Req() req: any,
    @Query() queryDto: TransactionQueryDto,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );

    const {
      page = 1,
      limit = 20,
      search,
      isCategorised,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'DESC',
    } = queryDto;

    const query = this.buildTransactionQuery(businessId, queryDto);

    const skip = (page - 1) * limit;
    const summary = await this.getTransactionSummary(query);

    const [data, total] = await query
      .orderBy(`tx.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const serialized = await Promise.all(
      data.map((tx) => this.serializeTransaction(tx)),
    );

    return {
      data: serialized,
      summary,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get('transactions/summary')
  @ApiOperation({
    summary:
      "Get transaction counts for the user's business with optional filtering",
  })
  @ApiResponse({
    status: 200,
    description:
      'Total, categorized, and uncategorized transaction counts for the current filters',
    type: TransactionSummaryResponseDto,
  })
  async getTransactionSummaryEndpoint(
    @Req() req: any,
    @Query() queryDto: TransactionQueryDto,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const query = this.buildTransactionQuery(businessId, queryDto);
    return this.getTransactionSummary(query);
  }

  private async resolveFinanceTransaction(
    userId: string,
    businessId: string,
    transactionId: string,
  ): Promise<Transaction | null> {
    const financeTransaction = await this.transactionRepository.findOneBy({
      id: transactionId,
      businessId,
    });

    if (financeTransaction) {
      return financeTransaction;
    }

    const monoTransaction = await this.monoTransactionRepository.findOne({
      where: { id: transactionId },
      relations: ['monoAccount', 'monoAccount.user'],
    });

    if (!monoTransaction || monoTransaction.monoAccount?.user?.id !== userId) {
      return null;
    }

    return this.transactionRepository.findOneBy({
      externalId: `mono_${monoTransaction.monoTransactionId}`,
      businessId,
    });
  }

  private resolveAssetCategory(categoryId: string): AssetCategory {
    const match = this.assetCategoryOptions.find(
      (option) => option.id === categoryId,
    );

    if (!match) {
      throw AppException.badRequest(
        'Invalid categoryId - use GET /finance/assets/categories to find valid IDs.',
        'FINANCE_INVALID_ASSET_CATEGORY',
      );
    }

    return match.value;
  }

  private serializeAsset(asset: Asset) {
    const categoryId =
      this.assetCategoryOptions.find((option) => option.value === asset.category)
        ?.id || '';

    return {
      ...asset,
      categoryId,
    };
  }

  private resolveLiabilityType(liabilityTypeId: string): LiabilityType {
    const match = this.liabilityTypeOptions.find(
      (option) => option.id === liabilityTypeId,
    );

    if (!match) {
      throw AppException.badRequest(
        'Invalid liabilityTypeId - use GET /finance/liabilities/types to find valid IDs.',
        'FINANCE_INVALID_LIABILITY_TYPE',
      );
    }

    return match.value;
  }

  private serializeLiability(liability: Liability) {
    const liabilityTypeId =
      this.liabilityTypeOptions.find(
        (option) => option.value === liability.liabilityType,
      )?.id || '';

    return {
      ...liability,
      liabilityTypeId,
    };
  }

  private buildTransactionQuery(
    businessId: string,
    queryDto: TransactionQueryDto,
  ): SelectQueryBuilder<Transaction> {
    const { search, isCategorised, startDate, endDate } = queryDto;

    const query = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx."businessId" = :businessId', { businessId });

    if (search) {
      query.andWhere(
        '(tx.description ILIKE :search OR tx.name ILIKE :search OR tx."externalId" ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isCategorised !== undefined) {
      query.andWhere('tx."isCategorised" = :isCategorised', {
        isCategorised,
      });
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.andWhere('tx.date BETWEEN :startDate AND :endDate', {
          startDate: start,
          endDate: end,
        });
      }
    }

    return query;
  }

  private async getTransactionSummary(
    query: SelectQueryBuilder<Transaction>,
  ): Promise<TransactionSummaryResponseDto> {
    const summaryRaw = await query
      .clone()
      .select('COUNT(*)', 'totalTransactions')
      .addSelect(
        'SUM(CASE WHEN tx."isCategorised" = true THEN 1 ELSE 0 END)',
        'totalCategorized',
      )
      .addSelect(
        'SUM(CASE WHEN tx."isCategorised" = false THEN 1 ELSE 0 END)',
        'totalUncategorized',
      )
      .getRawOne();

    return {
      totalTransactions: Number(summaryRaw?.totalTransactions || 0),
      totalCategorized: Number(summaryRaw?.totalCategorized || 0),
      totalUncategorized: Number(summaryRaw?.totalUncategorized || 0),
    };
  }

  private async serializeTransaction(tx: Transaction | null) {
    if (!tx) {
      return tx;
    }

    let sourceTransactionId: string | undefined;
    let sourceProvider: string | undefined;

    if (tx.externalId?.startsWith('mono_')) {
      const monoTransactionId = tx.externalId.slice(5);
      const monoTransaction = await this.monoTransactionRepository.findOneBy({
        monoTransactionId,
      });

      if (monoTransaction) {
        sourceTransactionId = monoTransaction.id;
        sourceProvider = 'mono';
      }
    }

    return {
      ...tx,
      sourceTransactionId,
      sourceProvider,
    };
  }

  @Post('transactions/retroactive-ai-sync')
  @ApiOperation({
    summary: 'Initialize AI categorisation sync',
    description:
      'Runs AI prediction (+ direction fallback) over all uncategorised ' +
      'transactions for the current business, instantly populating reports.',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of transactions updated',
  })
  async retroactiveAiSync(@Req() req: any) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const updated = await this.categorizationService.retroactiveAiSync(
      businessId,
      req.user.id,
    );
    return { updated, message: `${updated} transactions categorised.` };
  }

  @Post('transactions/upload-csv')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload bank transactions via CSV',
    description:
      'Upload a CSV file from your bank statement. The system auto-detects common column headers (Date, Amount, Credit/Debit, Description, Reference). Duplicates are automatically skipped.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV file' },
        bankAccountId: {
          type: 'string',
          description: 'Optional bank account ID to link transactions to',
        },
      },
      required: ['file'],
    },
  })
  @ApiQuery({
    name: 'bankAccountId',
    required: false,
    type: String,
    description: 'Bank account UUID to link uploaded transactions to',
  })
  @ApiResponse({
    status: 201,
    description: 'CSV processed — shows imported, skipped, and errors',
    type: CsvUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid CSV or missing required columns',
    type: ErrorResponseDto,
  })
  async uploadCsv(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    if (!file) {
      throw AppException.badRequest(
        'No file uploaded. Please attach a CSV file.',
        'CSV_NO_FILE',
      );
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw AppException.badRequest(
        'Only CSV files are accepted.',
        'CSV_INVALID_FILE_TYPE',
      );
    }

    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );

    return this.csvUploadService.processCSV(
      file.buffer,
      businessId,
      req.user.id,
      bankAccountId,
    );
  }

  @Post('transactions/upload-pdf')
  @UseGuards(PlanGuard)
  @RequirePlan('basic')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10_000_000 } }),
  )
  @ApiOperation({
    summary: 'Upload bank transactions via PDF',
    description:
      'Upload a text-searchable PDF bank statement. Supported banks include GTB, Zenith, Access, and others with standard transaction row formats. Duplicates are automatically skipped.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF file' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'PDF processed — shows imported, skipped, and errors',
    type: CsvUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid PDF or no searchable text found',
    type: ErrorResponseDto,
  })
  @ApiQuery({
    name: 'autoCategorize',
    required: false,
    type: Boolean,
    example: false,
    description:
      'Set to true to auto-categorize imported OCR/PDF transactions',
  })
  async uploadPdf(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('autoCategorize') autoCategorize?: string,
  ) {
    if (!file) {
      throw AppException.badRequest(
        'No file uploaded. Please attach a PDF file.',
        'PDF_NO_FILE',
      );
    }

    this.logger.log(
      `PDF upload received: ${file.originalname} (${file.size} bytes)`,
    );

    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      throw AppException.badRequest(
        'Only PDF files are accepted.',
        'PDF_INVALID_FILE_TYPE',
      );
    }

    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );

    return this.pdfUploadService.processPdf(
      file.buffer,
      businessId,
      req.user.id,
      autoCategorize === 'true',
    );
  }

  @Get('bank-accounts')
  @ApiOperation({ summary: "List all bank accounts for the user's business" })
  @ApiResponse({
    status: 200,
    description: 'List of bank accounts',
  })
  async listBankAccounts(@Req() req: any) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    return this.bankAccountService.listAccounts(req.user.id, businessId);
  }

  @Patch('bank-accounts/:id/primary')
  @ApiOperation({ summary: 'Set a bank account as primary' })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  @ApiResponse({
    status: 200,
    description: 'Account set as primary',
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
    type: ErrorResponseDto,
  })
  async setPrimaryAccount(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    return this.bankAccountService.setPrimaryAccount(
      req.user.id,
      businessId,
      id,
    );
  }

  @Delete('bank-accounts/:id')
  @ApiOperation({
    summary: 'Disconnect/delete a bank account',
    description:
      'Permanently removes the bank account link. If it was the primary account, another will be automatically promoted.',
  })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  @ApiResponse({
    status: 200,
    description: 'Account deleted',
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
    type: ErrorResponseDto,
  })
  async deleteBankAccount(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    await this.bankAccountService.deleteAccount(req.user.id, businessId, id);
    return { message: 'Bank account deleted and primary status updated' };
  }
}
