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

  describe('bounded AI batches', () => {
    const category = {
      id: 'expense',
      name: 'Expense',
      type: TransactionCategory.EXPENSE,
      subCategories: [{ id: 'data', name: 'Airtime/Data Subscription' }],
    } as AccountCategory;

    function setup(
      transactions: Partial<Transaction>[],
      settings: Record<string, string> = {},
    ) {
      const query = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(transactions),
      };
      txRepo.createQueryBuilder = jest.fn().mockReturnValue(query);
      jest.spyOn(service, 'listCategories').mockResolvedValue([category]);
      configService.get.mockImplementation(
        (key: string) =>
          ({
            CATEGORY_SUGGESTION_AI_BASE_URL: 'https://example.com/v1',
            CATEGORY_SUGGESTION_AI_MODEL: 'test-model',
            CATEGORY_SUGGESTION_AI_BATCH_SIZE: '2',
            ...settings,
          })[key],
      );
      mockedAxios.post.mockImplementation(async (_url, body: any) => {
        const payload = JSON.parse(body.messages[1].content);
        return {
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    results: payload.transactions
                      .map((tx: any) => ({
                        transactionIndex: tx.transactionIndex,
                        categoryType: TransactionCategory.EXPENSE,
                        subCategoryName: 'Airtime/Data Subscription',
                        confidence: 0.95,
                      }))
                      .reverse(),
                  }),
                },
              },
            ],
          },
        };
      });
    }

    function transaction(id: string): Partial<Transaction> {
      return {
        id,
        description: 'Internet bundle',
        amount: 100,
        direction: TransactionDirection.DEBIT,
        category: TransactionCategory.EXPENSE,
        isCategorised: true,
        notes: 'Keep this note',
      };
    }

    it('sends only incomplete non-manual transactions and maps batched results', async () => {
      const incomplete = [transaction('1'), transaction('2'), transaction('3')];
      incomplete[1].category = '';
      incomplete[1].subCategory = 'Airtime/Data Subscription';
      const complete = {
        ...transaction('complete'),
        subCategory: 'Existing category',
      };
      const manual = {
        ...transaction('manual'),
        categorySource: CategorySource.MANUAL,
      };
      setup([complete, manual, ...incomplete]);

      expect(await service.retroactiveAiSync('biz', 'user')).toBe(3);
      const payloads = mockedAxios.post.mock.calls.map(
        ([, body]: any) => JSON.parse(body.messages[1].content).transactions,
      );
      expect(payloads.map((rows) => rows.length)).toEqual([2, 1]);
      for (const tx of incomplete) {
        expect(tx.subCategoryId).toBe('data');
        expect(tx.notes).toBe('Keep this note');
      }
      expect(complete.subCategory).toBe('Existing category');
      expect(manual.categorySource).toBe(CategorySource.MANUAL);
      expect(txRepo.save).toHaveBeenCalledTimes(2);
    });

    it('continues and saves subsequent batches after an AI timeout', async () => {
      const rows = [transaction('1'), transaction('2'), transaction('3')];
      setup(rows);
      mockedAxios.post.mockRejectedValueOnce(new Error('timeout'));
      await service.retroactiveAiSync('biz', 'user');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(rows[0].category).toBe(TransactionCategory.EXPENSE);
      expect(rows[0].notes).toBe('Keep this note');
      expect(rows[2].subCategoryId).toBe('data');
      expect(txRepo.save).toHaveBeenCalledTimes(2);
    });

    it('does not contact AI when all transactions are complete or manual', async () => {
      setup([
        { ...transaction('complete'), subCategory: 'Existing' },
        { ...transaction('manual'), categorySource: CategorySource.MANUAL },
      ]);
      expect(await service.retroactiveAiSync('biz', 'user')).toBe(0);
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(aiService.predict).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('uses result indexes and ignores invalid indexes and low confidence', async () => {
      const rows = [transaction('1'), transaction('2')];
      setup(rows);
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      transactionIndex: 1,
                      categoryType: 'EXPENSE',
                      subCategoryName: 'Airtime/Data Subscription',
                      confidence: 0.2,
                    },
                    {
                      transactionIndex: 99,
                      categoryType: 'EXPENSE',
                      confidence: 1,
                    },
                    {
                      transactionIndex: 0,
                      categoryType: 'EXPENSE',
                      subCategoryName: 'Airtime/Data Subscription',
                      confidence: 0.95,
                    },
                  ],
                }),
              },
            },
          ],
        },
      });
      await service.retroactiveAiSync('biz', 'user');
      expect(rows[0].subCategoryId).toBe('data');
      expect(rows[1].subCategoryId).toBeUndefined();
    });

    it('splits long narrations by prompt size during ingestion', async () => {
      setup([], { CATEGORY_SUGGESTION_AI_BATCH_MAX_CHARS: '3000' });
      txRepo.find.mockResolvedValue([]);
      const dtos = Array.from({ length: 3 }, (_, index) => ({
        externalId: `external-${index}`,
        description: 'Internet bundle '.repeat(200),
        amount: 100,
        direction: TransactionDirection.DEBIT,
        date: new Date(),
      }));
      await service.ingestTransactions('biz', 'user', dtos, {
        autoCategorize: true,
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
      for (const [, body] of mockedAxios.post.mock.calls as any) {
        expect(
          body.messages[0].content.length + body.messages[1].content.length,
        ).toBeLessThanOrEqual(3000);
        expect(JSON.parse(body.messages[1].content).transactions).toHaveLength(
          1,
        );
      }
    });
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

  it('keeps a COGS rule under COGS when Expenses has a subcategory with the same name', async () => {
    ruleRepo.find.mockResolvedValue([{
      id: 'packaging-rule', matchValue: 'purchase', matchType: MatchType.CONTAINS,
      category: TransactionCategory.COGS, subCategory: 'Packaging Cost',
    }]);
    txRepo.find.mockResolvedValue([]);
    subCatRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.category?.type === TransactionCategory.COGS
        ? { id: 'cogs-sub', name: 'Packaging Cost', category: { id: 'cogs-parent', type: TransactionCategory.COGS } }
        : { id: 'expense-sub', name: 'Packaging Cost', category: { id: 'expense-parent', type: TransactionCategory.EXPENSE } },
    );
    await service.ingestTransactions('biz-1', 'user-1', [{
      externalId: 'purchase-1', description: 'Purchase of packaging', amount: 500,
      direction: TransactionDirection.DEBIT, date: new Date('2026-10-29'),
    }], { autoCategorize: true });
    expect(txRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ category: TransactionCategory.COGS, categoryId: 'cogs-parent', subCategoryId: 'cogs-sub' }),
    ]), expect.any(Object));
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
        STATEMENT_AI_BASE_URL:
          'https://generativelanguage.googleapis.com/v1beta',
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
