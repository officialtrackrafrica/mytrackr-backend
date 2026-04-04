import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import pdf from 'pdf-parse';
import {
  Transaction,
  TransactionDirection,
} from '../entities/transaction.entity';

interface ParsedRow {
  date: string;
  name?: string;
  amount: number;
  direction: TransactionDirection;
  description: string;
  reference?: string;
}

@Injectable()
export class PdfUploadService {
  private readonly logger = new Logger(PdfUploadService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Parse a PDF buffer and create Transaction entities.
   */
  async processPdf(
    fileBuffer: Buffer,
    businessId: string,
    userId: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    this.logger.log(
      `Starting PDF parse — buffer size: ${fileBuffer.length} bytes`,
    );

    let data: any;
    try {
      // Wrap pdf-parse in a timeout to prevent indefinite hangs
      const TIMEOUT_MS = 30_000;
      data = await Promise.race([
        pdf(fileBuffer),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('PDF parsing timed out after 30 seconds')),
            TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (err: any) {
      this.logger.error(`PDF parse error: ${err.message}`);
      throw new BadRequestException(
        `Could not parse the PDF file: ${err.message}. Please ensure it is a valid, text-searchable PDF.`,
      );
    }

    const text = data.text;
    if (!text || text.trim().length === 0) {
      throw new BadRequestException(
        'PDF file appears to be empty or contains no extractable text (it might be a scanned image).',
      );
    }

    this.logger.log(
      `PDF text extracted — ${text.length} chars. Parsing transaction rows...`,
    );

    const lines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);
    const parsedRows: ParsedRow[] = this.extractTransactions(lines);

    this.logger.log(`Detected ${parsedRows.length} transaction rows`);

    if (parsedRows.length === 0) {
      throw new BadRequestException(
        'No transactions could be detected in the PDF. Please ensure this is a supported bank statement format.',
      );
    }

    // Save to DB
    const imported = await this.saveTransactions(
      parsedRows,
      businessId,
      userId,
    );

    return {
      imported,
      skipped: parsedRows.length - imported,
      errors: [],
    };
  }

  /**
   * Extract transaction rows using regex patterns.
   */
  private extractTransactions(lines: string[]): ParsedRow[] {
    const rows: ParsedRow[] = [];

    // Common patterns for Nigerian Banks
    // 1. GTBank Sample: 10-MAR-2025 TRANS DESCRIPTION 5,000.00 0.00 45,000.00
    const gtPattern =
      /^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

    // 2. Zenith/Access Sample: 10/03/2025 NARRATION 10,000.00 CR
    const genericPattern =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR|DR)?$/i;

    // 3. Another common format: 10-MAR-2025 DESCRIPTION 10,000.00 -5,000.00
    const dashPattern =
      /^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+(-?[\d,]+\.\d{2})$/;

    for (const line of lines) {
      // Try GTBank pattern
      const gtMatch = line.match(gtPattern);
      if (gtMatch) {
        const [, date, desc, debit, credit] = gtMatch;
        const dVal = this.parseAmount(debit);
        const cVal = this.parseAmount(credit);

        if (cVal > 0) {
          rows.push({
            date: this.formatDate(date),
            amount: cVal,
            direction: TransactionDirection.CREDIT,
            description: desc.trim(),
          });
        } else if (dVal > 0) {
          rows.push({
            date: this.formatDate(date),
            amount: dVal,
            direction: TransactionDirection.DEBIT,
            description: desc.trim(),
            name: this.extractName(desc),
          });
        }
        continue;
      }

      // Try Generic pattern (Date Narration Amount CR/DR)
      const genMatch = line.match(genericPattern);
      if (genMatch) {
        const [, date, desc, amountStr, indicator] = genMatch;
        const amount = this.parseAmount(amountStr);
        if (amount === 0) continue;

        let direction = TransactionDirection.DEBIT;
        if (indicator?.toUpperCase() === 'CR') {
          direction = TransactionDirection.CREDIT;
        } else if (indicator?.toUpperCase() === 'DR') {
          direction = TransactionDirection.DEBIT;
        } else {
          // If no indicator, assume negative amounts are DEBIT
          direction = amountStr.includes('-')
            ? TransactionDirection.DEBIT
            : TransactionDirection.CREDIT;
        }

        rows.push({
          date: this.formatDate(date),
          amount: Math.abs(amount),
          direction,
          description: desc.trim(),
          name: this.extractName(desc),
        });
        continue;
      }

      // Try Dash pattern
      const dashMatch = line.match(dashPattern);
      if (dashMatch) {
        const [, date, desc, amountStr] = dashMatch;
        const amount = this.parseAmount(amountStr);
        if (amount === 0) continue;

        rows.push({
          date: this.formatDate(date),
          amount: Math.abs(amount),
          direction:
            amount < 0
              ? TransactionDirection.DEBIT
              : TransactionDirection.CREDIT,
          description: desc.trim(),
          name: this.extractName(desc),
        });
      }
    }

    return rows;
  }

  /**
   * Attempt to extract a counterparty name from transaction narration.
   */
  private extractName(narration: string): string | undefined {
    // Patterns: "TRF FROM NAME", "PAYMENT TO NAME", "NAME /REF", etc.
    const patterns = [
      /TRF\s+(?:FROM|TO)\s+([^/]+)/i,
      /TRANSFER\s+(?:FROM|TO)\s+([^/]+)/i,
      /PAYMENT\s+(?:FROM|TO)\s+([^/]+)/i,
      /^([^/]+)\s+\/\s+/i, // "AYANFE GBENGA / FOOD"
    ];

    for (const p of patterns) {
      const match = narration.match(p);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private parseAmount(str: string): number {
    if (!str) return 0;
    const cleaned = str.replace(/[₦$€£,\s]/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  private formatDate(dateStr: string): string {
    // Standardize to YYYY-MM-DD
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    // Handle DD-MMM-YYYY manually if Date fails
    const parts = dateStr.split(/[/-]/);
    if (parts.length === 3) {
      const [d, m] = parts;
      let y = parts[2];
      if (y.length === 2) y = '20' + y;
      const months: Record<string, string> = {
        JAN: '01',
        FEB: '02',
        MAR: '03',
        APR: '04',
        MAY: '05',
        JUN: '06',
        JUL: '07',
        AUG: '08',
        SEP: '09',
        OCT: '10',
        NOV: '11',
        DEC: '12',
      };
      const monthNum = months[m.toUpperCase()] || m.padStart(2, '0');
      return `${y}-${monthNum}-${d.padStart(2, '0')}`;
    }
    return dateStr;
  }

  private async saveTransactions(
    rows: ParsedRow[],
    businessId: string,
    userId: string,
  ): Promise<number> {
    let imported = 0;

    for (const row of rows) {
      const transaction = this.transactionRepository.create({
        date: new Date(row.date),
        name: row.name || undefined,
        amount: row.amount,
        direction: row.direction,
        description: row.description,
        externalId: row.reference || undefined,
        businessId,
        userId,
        isCategorised: false,
      });

      try {
        await this.transactionRepository.save(transaction);
        imported++;
      } catch (err: any) {
        // Skip duplicates (unique constraint violations)
        if (
          err.code === '23505' ||
          err.message?.includes('duplicate') ||
          err.message?.includes('unique')
        ) {
          this.logger.debug(
            `Skipped duplicate transaction: ${row.date} ${row.amount} ${row.description}`,
          );
        } else {
          this.logger.warn(`Failed to save row: ${err.message}`);
        }
      }
    }

    return imported;
  }
}
