import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Transaction,
  TransactionDirection,
} from '../entities/transaction.entity';

// Mock pdf-parse before importing the service
const mockPdf = jest.fn();
jest.mock('pdf-parse', () => mockPdf);

// Now import the service
import { PdfUploadService } from './pdf-upload.service';

describe('PdfUploadService', () => {
  let service: PdfUploadService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfUploadService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: repo,
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
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        direction: TransactionDirection.DEBIT,
        description: 'TRANSFER FROM ALICE',
      }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        direction: TransactionDirection.CREDIT,
        description: 'PAYMENT TO BOB',
      }),
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
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        direction: TransactionDirection.DEBIT,
        description: 'ATM WITHDRAWAL',
      }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 150000,
        direction: TransactionDirection.CREDIT,
        description: 'SALARY DEPOSIT',
      }),
    );
  });
});
