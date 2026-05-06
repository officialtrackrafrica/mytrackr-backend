import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../entities/transaction.entity';
import { CategorizationRule } from '../entities/categorization-rule.entity';
import { AccountCategory } from '../entities/account-category.entity';
import { AccountSubCategory } from '../entities/account-subcategory.entity';
import { AiCategorizationService } from '../../categorization/categorization.service';
import {
  CategorizationService,
  RawTransactionDto,
} from './categorization.service';

describe('CategorizationService', () => {
  let service: CategorizationService;
  let txRepo: any;
  let ruleRepo: any;
  let catRepo: any;
  let subCatRepo: any;
  let aiService: any;

  beforeEach(async () => {
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
    };
    subCatRepo = {
      findOne: jest.fn(),
    };
    aiService = {
      predict: jest
        .fn()
        .mockResolvedValue({ category: 'Uncategorized', confidence: 0 }),
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
});
