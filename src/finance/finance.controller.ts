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
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
import { BusinessService } from '../business/services/business.service';
import { Asset } from './entities/asset.entity';
import { Liability, LiabilityStatus } from './entities/liability.entity';
import { Transaction, CategorySource } from './entities/transaction.entity';
import { AccountCategory } from './entities/account-category.entity';
import { AccountSubCategory } from './entities/account-subcategory.entity';
import { CategorizationService } from './services/categorization.service';
import { CsvUploadService } from './services/csv-upload.service';
import { PdfUploadService } from './services/pdf-upload.service';
import { BankAccountService } from './services/bank-account.service';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
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
  TransactionResponseDto,
  ArchiveMessageResponseDto,
  CsvUploadResponseDto,
  TransactionQueryDto,
  PaginatedTransactionResponseDto,
  AccountCategoryResponseDto,
} from './dto';

@ApiTags(SWAGGER_TAGS[5].name)
@Controller('finance')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

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
    @InjectRepository(AccountCategory)
    private readonly categoryRepository: Repository<AccountCategory>,
    @InjectRepository(AccountSubCategory)
    private readonly subCategoryRepository: Repository<AccountSubCategory>,
    private readonly categorizationService: CategorizationService,
    private readonly bankAccountService: BankAccountService,
  ) {}

  @Get('assets')
  @ApiOperation({ summary: "List all assets for the user's business" })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'List of assets',
    type: [AssetResponseDto],
  })
  async listAssets(
    @Req() req: any,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const where: any = { businessId };

    if (includeArchived !== 'true') {
      where.isArchived = false;
    }
    return this.assetRepository.find({ where, order: { createdAt: 'DESC' } });
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
    const asset = this.assetRepository.create(dto);
    return this.assetRepository.save(asset);
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
    await this.assetRepository.update(id, dto);
    return this.assetRepository.findOneBy({ id });
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

  @Get('liabilities')
  @ApiOperation({ summary: "List all liabilities for the user's business" })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of liabilities',
    type: [LiabilityResponseDto],
  })
  async listLiabilities(@Req() req: any, @Query('status') status?: string) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    const where: any = { businessId };

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
    const liability = this.liabilityRepository.create(dto);
    return this.liabilityRepository.save(liability);
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
    await this.liabilityRepository.update(id, dto);
    return this.liabilityRepository.findOneBy({ id });
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
  async listCategories(@Req() req: any) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    return this.categorizationService.listCategories(businessId);
  }

  // --- Transaction Repair ---

  @Post('transactions/repair')
  @ApiOperation({
    summary: 'Repair orphaned transactions',
    description:
      'Fixes all transactions that are missing a businessId or are uncategorised. ' +
      'Call this once to fix zero-value reports after linking a bank account.',
  })
  @ApiResponse({
    status: 200,
    description: 'Repair results',
  })
  async repairTransactions(@Req() req: any) {
    const businessId = await this.businessService.getBusinessIdForUser(
      req.user.id,
    );
    return this.categorizationService.repairOrphanedTransactions(
      businessId,
      req.user.id,
    );
  }

  // --- Transactions ---

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

    // Resolve category/subcategory UUIDs to string names
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
    const tx = await this.transactionRepository.findOneBy({ id, businessId });
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
    return this.transactionRepository.findOneBy({ id });
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

    const query = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId });

    if (search) {
      query.andWhere(
        '(tx.description ILIKE :search OR tx.name ILIKE :search OR tx.externalId ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isCategorised !== undefined) {
      query.andWhere('tx.isCategorised = :isCategorised', { isCategorised });
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

    const skip = (page - 1) * limit;

    const [data, total] = await query
      .orderBy(`tx.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
  async uploadPdf(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
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
