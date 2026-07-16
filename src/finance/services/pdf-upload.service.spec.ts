import { Test, TestingModule } from '@nestjs/testing';
import { TransactionDirection } from '../entities/transaction.entity';
import { CategorizationService } from './categorization.service';
import { OcrService } from './ocr.service';
import { PdfAiQueueService } from './pdf-ai-queue.service';
import { StatementAiParserService } from './statement-ai-parser.service';

// Mock pdf-parse before importing the service
const mockPdf = jest.fn();
jest.mock('pdf-parse', () => mockPdf);

// Now import the service
import { PdfUploadService } from './pdf-upload.service';

describe('PdfUploadService', () => {
  let service: PdfUploadService;
  let categorizationService: { ingestTransactions: jest.Mock };

  beforeEach(async () => {
    mockPdf.mockReset();
    categorizationService = {
      ingestTransactions: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfUploadService,
        {
          provide: CategorizationService,
          useValue: categorizationService,
        },
        {
          provide: OcrService,
          useValue: {
            extractTextFromPdf: jest.fn(),
          },
        },
        {
          provide: PdfAiQueueService,
          useValue: {
            getExistingFingerprintStatus: jest.fn().mockResolvedValue(null),
            recordImmediateCompletion: jest.fn().mockResolvedValue(undefined),
            tryAcquireInlineCapacity: jest.fn().mockResolvedValue(true),
            releaseInlineCapacity: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StatementAiParserService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(false),
            supportsDirectPdfInput: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<PdfUploadService>(PdfUploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract transactions from GTBank format', async () => {
    const mockText = `
      TRANSACTION DETAILS
      10-MAR-2025 TRANSFER FROM ALICE 5,000.00 0.00 45,000.00
      11-MAR-2025 PAYMENT TO BOB 0.00 2,500.00 42,500.00
    `;
    mockPdf.mockResolvedValue({ text: mockText });

    const result = await service.processPdf(
      Buffer.from('dummy'),
      'biz-1',
      'user-1',
    );

    expect(result.imported).toBe(2);
    expect(categorizationService.ingestTransactions).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          date: new Date('2025-03-10'),
          amount: 5000,
          direction: TransactionDirection.DEBIT,
          description: 'TRANSFER FROM ALICE',
        }),
        expect.objectContaining({
          date: new Date('2025-03-11'),
          amount: 2500,
          direction: TransactionDirection.CREDIT,
          description: 'PAYMENT TO BOB',
        }),
      ]),
      { autoCategorize: false },
    );
  });

  it('should extract transactions from Generic format (CR/DR)', async () => {
    const mockText = `
      Statement of Account
      10/03/2025 ATM WITHDRAWAL 10,000.00 DR
      12/03/2025 SALARY DEPOSIT 150,000.00 CR
    `;
    mockPdf.mockResolvedValue({ text: mockText });

    const result = await service.processPdf(
      Buffer.from('dummy'),
      'biz-1',
      'user-1',
    );

    expect(result.imported).toBe(2);
    expect(categorizationService.ingestTransactions).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          date: new Date('2025-03-10'),
          amount: 10000,
          direction: TransactionDirection.DEBIT,
          description: 'ATM WITHDRAWAL',
        }),
        expect.objectContaining({
          date: new Date('2025-03-12'),
          amount: 150000,
          direction: TransactionDirection.CREDIT,
          description: 'SALARY DEPOSIT',
        }),
      ]),
      { autoCategorize: false },
    );
  });

  it('should assign stable unique external IDs to repeated PDF rows', async () => {
    const mockText = `
      TRANSACTION DETAILS
      10-MAR-2025 POS PURCHASE 1,000.00 0.00 45,000.00
      10-MAR-2025 POS PURCHASE 1,000.00 0.00 45,000.00
    `;
    mockPdf.mockResolvedValue({ text: mockText });

    await service.processPdf(Buffer.from('dummy'), 'biz-1', 'user-1');

    const [, , dtos] = categorizationService.ingestTransactions.mock.calls[0];
    expect(dtos).toEqual([
      expect.objectContaining({
        externalId: 'pdf:biz-1:2025-03-10:1000:DEBIT:POS PURCHASE',
      }),
      expect.objectContaining({
        externalId:
          'pdf:biz-1:2025-03-10:1000:DEBIT:POS PURCHASE:duplicate-2',
      }),
    ]);
  });

  it('should extract transactions from compact signed amount statement rows', async () => {
    const mockText = `
      Account Statement
      Trans. DateValue DateDescription
      Debit/Credit(N)Balance(N)
      ChannelTransaction Reference
      10 Feb 202510 Feb 2025Transfer to AISHAT ABIKE DOSUNMU-3,600.0022,425.52E-Channel100004250210130420126977416680
      11 Feb 202511 Feb 2025Transfer from OLUWAKAYODE JEREMIAH ADEDIRE+10,000.0032,425.52E-Channel100033250211133200971522496124
    `;
    mockPdf.mockResolvedValue({ text: mockText });

    const result = await service.processPdf(
      Buffer.from('dummy'),
      'biz-1',
      'user-1',
      true,
    );

    expect(result.imported).toBe(2);
    expect(categorizationService.ingestTransactions).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          date: new Date('2025-02-10'),
          amount: 3600,
          direction: TransactionDirection.DEBIT,
          description: 'Transfer to AISHAT ABIKE DOSUNMU',
          externalId: '100004250210130420126977416680',
          name: 'AISHAT ABIKE DOSUNMU',
        }),
        expect.objectContaining({
          date: new Date('2025-02-11'),
          amount: 10000,
          direction: TransactionDirection.CREDIT,
          description: 'Transfer from OLUWAKAYODE JEREMIAH ADEDIRE',
          externalId: '100033250211133200971522496124',
          name: 'OLUWAKAYODE JEREMIAH ADEDIRE',
        }),
      ]),
      { autoCategorize: true },
    );
  });
});
