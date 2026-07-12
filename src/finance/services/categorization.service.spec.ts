import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import axios from 'axios';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
  CategorySource,
} from '../entities/transaction.entity';
import {
  CategorizationRule,
  MatchType,
} from '../entities/categorization-rule.entity';
import { AccountCategory } from '../entities/account-category.entity';
import { AccountSubCategory } from '../entities/account-subcategory.entity';
import { AiCategorizationService } from '../../categorization/categorization.service';
import {
  CategorizationService,
  RawTransactionDto,
} from './categorization.service';

jest.mock('axios');

describe('CategorizationService', () => {
  let service: CategorizationService;
  let txRepo: any;
  let ruleRepo: any;
  let catRepo: any;
  let subCatRepo: any;
  let aiService: any;
  let configService: any;

  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(async () => {
    jest.clearAllMocks();
    txRepo = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn(),
    };
    ruleRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    catRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    subCatRepo = {
      findOne: jest.fn(),
    };
    aiService = {
      predict: jest
        .fn()
        .mockResolvedValue({ category: 'Uncategorized', confidence: 0 }),
      learnFeedback: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategorizationService,
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: getRepositoryToken(CategorizationRule), useValue: ruleRepo },
        { provide: getRepositoryToken(AccountCategory), useValue: catRepo },
        {
          provide: getRepositoryToken(AccountSubCategory),
          useValue: subCatRepo,
        },
        { provide: AiCategorizationService, useValue: aiService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<CategorizationService>(CategorizationService);
  });

  it('should re-claim orphaned transactions with null businessId', async () => {
    const existingTx = {
      id: 'old-uuid',
      externalId: 'mono_123',
      businessId: null,
      isCategorised: false,
    };

    txRepo.find.mockResolvedValue([existingTx]);
    txRepo.findOneBy.mockResolvedValue(existingTx);

    const dtos: RawTransactionDto[] = [
      {
        bankAccountId: 'acc_1',
        externalId: 'mono_123',
        description: 'Test Transaction',
        amount: 1000,
        direction: TransactionDirection.CREDIT,
        date: new Date(),
      },
    ];

    const businessId = 'new-biz-uuid';
    await service.ingestTransactions(businessId, 'user_1', dtos);

    expect(txRepo.create).not.toHaveBeenCalled();

    expect(txRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'old-uuid',
          businessId: 'new-biz-uuid',
          userId: 'user_1',
          isCategorised: false,
        }),
      ]),
      expect.any(Object),
    );
  });

  it('should not re-claim if businessId is already set to the same value', async () => {
    const existingTx = {
      id: 'old-uuid',
      externalId: 'mono_123',
      businessId: 'same-biz-uuid',
      isCategorised: true,
    };

    txRepo.find.mockResolvedValue([existingTx]);
    txRepo.findOneBy.mockResolvedValue(existingTx);

    const dtos: RawTransactionDto[] = [
      {
        bankAccountId: 'acc_1',
        externalId: 'mono_123',
        description: 'Test Transaction',
        amount: 1000,
        direction: TransactionDirection.CREDIT,
        date: new Date(),
      },
    ];

    const businessId = 'same-biz-uuid';
    const count = await service.ingestTransactions(businessId, 'user_1', dtos);

    expect(count).toBe(0);
    expect(txRepo.save).not.toHaveBeenCalled();
  });

  it('should resolve category and subcategory ids for rule matches', async () => {
    ruleRepo.find.mockResolvedValue([
      {
        id: 'rule-1',
        matchValue: 'airtime',
        matchType: MatchType.CONTAINS,
        category: TransactionCategory.EXPENSE,
        subCategory: 'Airtime/Data Subscription',
      },
    ]);
    txRepo.find.mockResolvedValue([]);
    subCatRepo.findOne.mockResolvedValue({
      id: 'sub-1',
      name: 'Airtime/Data Subscription',
      category: {
        id: 'cat-1',
        type: TransactionCategory.EXPENSE,
      },
    });

    const dtos: RawTransactionDto[] = [
      {
        externalId: 'pdf_1',
        description: 'Airtime',
        amount: 500,
        direction: TransactionDirection.DEBIT,
        date: new Date('2025-02-16'),
      },
    ];

    await service.ingestTransactions('biz-1', 'user-1', dtos, {
      autoCategorize: true,
    });

    expect(txRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: TransactionCategory.EXPENSE,
          categoryId: 'cat-1',
          subCategory: 'Airtime/Data Subscription',
          subCategoryId: 'sub-1',
          ruleId: 'rule-1',
          categorySource: CategorySource.RULE,
          isCategorised: true,
        }),
      ]),
      expect.any(Object),
    );
  });

  it('should use Gemini categorization during normal ingest when rules and gRPC AI do not match', async () => {
    const expenseCategory = {
      id: 'cat-expense',
      name: 'Expense',
      type: TransactionCategory.EXPENSE,
      subCategories: [
        {
          id: 'sub-data',
          name: 'Airtime/Data Subscription',
        },
      ],
    };
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([expenseCategory]),
    };
    catRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    txRepo.find.mockResolvedValue([]);
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        STATEMENT_AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
        STATEMENT_AI_MODEL: 'gemini-2.0-flash',
        STATEMENT_AI_API_KEY: 'test-key',
      };
      return values[key];
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    categoryName: 'Expense',
                    categoryType: TransactionCategory.EXPENSE,
                    subCategoryName: 'Airtime/Data Subscription',
                    confidence: 0.92,
                  }),
                },
              ],
            },
          },
        ],
      },
    });

    await service.ingestTransactions(
      'biz-1',
      'user-1',
      [
        {
          externalId: 'pdf_2',
          description: 'Unknown bank narration for internet bundle',
          amount: 1500,
          direction: TransactionDirection.DEBIT,
          date: new Date('2025-02-17'),
        },
      ],
      { autoCategorize: true },
    );

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(txRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: TransactionCategory.EXPENSE,
          categoryId: 'cat-expense',
          subCategory: 'Airtime/Data Subscription',
          subCategoryId: 'sub-data',
          categorySource: CategorySource.AI,
          isCategorised: true,
        }),
      ]),
      expect.any(Object),
    );
  });
});
