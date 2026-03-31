import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import {
  Transaction,
  TransactionDirection,
} from '../entities/transaction.entity';

/**
 * Supported CSV column header mappings (case-insensitive).
 * We try to auto-detect common bank statement column names.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  date: [
    'date',
    'transaction date',
    'trans date',
    'value date',
    'posting date',
    'txn date',
  ],
  amount: ['amount', 'transaction amount', 'trans amount', 'value'],
  credit: ['credit', 'credit amount', 'money in', 'deposit', 'cr'],
  debit: ['debit', 'debit amount', 'money out', 'withdrawal', 'dr'],
  description: [
    'description',
    'narration',
    'details',
    'transaction details',
    'particulars',
    'remarks',
    'memo',
  ],
  balance: ['balance', 'closing balance', 'running balance'],
  reference: [
    'reference',
    'ref',
    'reference number',
    'trans ref',
    'transaction ref',
  ],
  name: ['name', 'counterparty', 'beneficiary', 'sender', 'receiver'],
};

interface ParsedRow {
  date: string;
  name?: string;
  amount: number;
  direction: TransactionDirection;
  description: string;
  reference?: string;
}

@Injectable()
export class CsvUploadService {
  private readonly logger = new Logger(CsvUploadService.name);

  /**
   * Parse a CSV buffer and create Transaction entities.
   * Returns { imported, skipped, errors }.
   */
  async processCSV(
    fileBuffer: Buffer,
    businessId: string,
    userId: string,
    bankAccountId?: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    let records: Record<string, string>[];

    try {
      records = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
    } catch {
      throw new BadRequestException(
        'Could not parse the CSV file. Please ensure it is a valid CSV with headers.',
      );
    }

    if (!records || records.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows.');
    }

    // Build column mapping from detected headers
    const headers = Object.keys(records[0]);
    const columnMap = this.detectColumns(headers);

    if (!columnMap.date) {
      throw new BadRequestException(
        `Could not detect a "date" column. Found headers: ${headers.join(', ')}`,
      );
    }
    if (!columnMap.amount && !columnMap.credit && !columnMap.debit) {
      throw new BadRequestException(
        `Could not detect amount columns. Found headers: ${headers.join(', ')}. Expected one of: amount, credit/debit`,
      );
    }
    if (!columnMap.description) {
      throw new BadRequestException(
        `Could not detect a "description" column. Found headers: ${headers.join(', ')}`,
      );
    }

    const parsedRows: ParsedRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // +2 because row 1 is header, data starts at 2

      try {
        const parsed = this.parseRow(row, columnMap);
        if (parsed) {
          parsedRows.push(parsed);
        }
      } catch (e: any) {
        errors.push(`Row ${rowNum}: ${e.message}`);
      }
    }

    if (parsedRows.length === 0) {
      throw new BadRequestException(
        `No valid transactions found in the CSV. ${errors.length} errors encountered.`,
      );
    }

    // Save to DB
    const imported = await this.saveTransactions(
      parsedRows,
      businessId,
      userId,
      bankAccountId,
    );

    return {
      imported,
      skipped: parsedRows.length - imported,
      errors: errors.slice(0, 10), // cap errors shown
    };
  }

  private detectColumns(headers: string[]): Record<string, string | undefined> {
    const map: Record<string, string | undefined> = {};

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const header of headers) {
        const normalised = header.toLowerCase().trim();
        if (aliases.includes(normalised)) {
          map[field] = header;
          break;
        }
      }
    }

    return map;
  }

  private parseRow(
    row: Record<string, string>,
    columnMap: Record<string, string | undefined>,
  ): ParsedRow | null {
    // Date
    const rawDate = columnMap.date ? row[columnMap.date]?.trim() : '';
    if (!rawDate) {
      throw new Error('Missing date');
    }

    const parsedDate = this.parseDate(rawDate);
    if (!parsedDate) {
      throw new Error(`Invalid date format: "${rawDate}"`);
    }

    // Amount & Direction
    let amount: number;
    let direction: TransactionDirection;

    if (columnMap.credit && columnMap.debit) {
      // Separate credit/debit columns
      const creditStr = row[columnMap.credit]?.trim() || '';
      const debitStr = row[columnMap.debit]?.trim() || '';
      const creditVal = this.parseAmount(creditStr);
      const debitVal = this.parseAmount(debitStr);

      if (creditVal > 0) {
        amount = creditVal;
        direction = TransactionDirection.CREDIT;
      } else if (debitVal > 0) {
        amount = debitVal;
        direction = TransactionDirection.DEBIT;
      } else {
        // Skip rows with zero/empty amounts
        return null;
      }
    } else if (columnMap.amount) {
      const rawAmount = row[columnMap.amount]?.trim() || '';
      const parsed = this.parseAmount(rawAmount);

      if (parsed === 0) return null;

      if (parsed > 0) {
        amount = parsed;
        direction = TransactionDirection.CREDIT;
      } else {
        amount = Math.abs(parsed);
        direction = TransactionDirection.DEBIT;
      }
    } else {
      throw new Error('No amount data found');
    }

    // Description
    const description = columnMap.description
      ? row[columnMap.description]?.trim() || 'CSV Import'
      : 'CSV Import';

    // Reference
    const reference = columnMap.reference
      ? row[columnMap.reference]?.trim()
      : undefined;

    // Name
    const name = columnMap.name ? row[columnMap.name]?.trim() : undefined;

    return {
      date: parsedDate,
      name,
      amount,
      direction,
      description,
      reference,
    };
  }

  private parseAmount(str: string): number {
    if (!str) return 0;
    // Remove currency symbols, commas, spaces
    const cleaned = str.replace(/[₦$€£,\s]/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  private parseDate(dateStr: string): string | null {
    // Try common date formats

    // ISO: 2025-03-10
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      const d = new Date(+year, +month - 1, +day);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }

    // MM/DD/YYYY (US format) — try if day > 12 suggests DMY was wrong
    const mdyMatch = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (mdyMatch) {
      const [, month, day, year] = mdyMatch;
      if (+day <= 31 && +month <= 12) {
        const d = new Date(+year, +month - 1, +day);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
    }

    // Fallback: let JS parse it
    const fallback = new Date(dateStr);
    if (!isNaN(fallback.getTime())) {
      return fallback.toISOString().split('T')[0];
    }

    return null;
  }

  @InjectRepository(Transaction)
  private transactionRepository: Repository<Transaction>;

  private async saveTransactions(
    rows: ParsedRow[],
    businessId: string,
    userId: string,
    bankAccountId?: string,
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
        bankAccountId: bankAccountId || undefined,
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
