import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import pdf from 'pdf-parse';
import {
  Transaction,
  TransactionDirection,
} from '../entities/transaction.entity';
import { OcrService } from './ocr.service';

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
    private readonly ocrService: OcrService,
  ) {}

  /**
   * Extract text from PDF using pdf-parse library.
   */
  private async extractPdfText(buffer: Buffer): Promise<{ text: string }> {
    const TIMEOUT_MS = 30_000;
    return Promise.race([
      pdf(buffer),
      new Promise<{ text: string }>((_, reject) =>
        setTimeout(
          () => reject(new Error('PDF parsing timed out after 30 seconds')),
          TIMEOUT_MS,
        ),
      ),
    ]);
  }

  /**
   * Parse a PDF buffer and create Transaction entities.
   * Falls back to OCR if standard text extraction fails.
   */
  async processPdf(
    fileBuffer: Buffer,
    businessId: string,
    userId: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    this.logger.log(
      `Starting PDF parse — buffer size: ${fileBuffer.length} bytes`,
    );

    let text: string | null = null;
    let usedOcr = false;

    // Try standard text extraction first
    try {
      const data = await this.extractPdfText(fileBuffer);
      text = data.text;
    } catch (err: any) {
      this.logger.warn(`Standard PDF extraction failed: ${err.message}`);
    }

    if (!text || text.trim().length === 0) {
      this.logger.log(
        'Fallback: Attempting OCR extraction via Tesseract service...',
      );
      text = await this.ocrService.extractTextFromPdf(fileBuffer);

      if (!text || text.trim().length === 0) {
        this.logger.error(
          'No text retrieved from either pdf-parse or Tesseract OCR.',
        );
        throw new BadRequestException(
          'PDF file appears to be empty or contains no extractable text. Please ensure it is a valid bank statement.',
        );
      }
      usedOcr = true;
    }

    this.logger.log(
      `Success: PDF text retrieved (${usedOcr ? 'via OCR Service' : 'via pdf-parse'}) — ${text.length} characters found.`,
    );

    // --- RAW TEXT LOGGING START ---
    this.logger.log(`\n\n========== RAW PDF TEXT PREVIEW ==========`);
    // Print the first 2000 characters to prevent buffer overflow, but show enough to debug
    console.log(text.substring(0, 2000));
    this.logger.log(`========== END RAW PDF TEXT PREVIEW ==========\n\n`);
    // --- RAW TEXT LOGGING END ---

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

  private pushAccessRow(
    rows: ParsedRow[],
    dateStr: string,
    desc: string,
    debitStr: string,
    creditStr: string,
  ) {
    if (desc.includes('Opening Balance') || desc.includes('Closing Balance'))
      return;
    const dVal = debitStr === '-' ? 0 : this.parseAmount(debitStr);
    const cVal = creditStr === '-' ? 0 : this.parseAmount(creditStr);

    if (cVal > 0) {
      rows.push({
        date: this.formatDate(dateStr),
        amount: cVal,
        direction: TransactionDirection.CREDIT,
        description: desc.trim(),
      });
    } else if (dVal > 0) {
      rows.push({
        date: this.formatDate(dateStr),
        amount: dVal,
        direction: TransactionDirection.DEBIT,
        description: desc.trim(),
        name: this.extractName(desc),
      });
    }
  }

  /**
   * Extract transaction rows using single-line and multi-line state machines.
   */
  private extractTransactions(lines: string[]): ParsedRow[] {
    const rows: ParsedRow[] = [];

    // General patterns
    const gtPattern =
      /^(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})\s+(.+?)\s+([-\d,]+\.\d{2})\s+([-\d,]+\.\d{2})(?:\s+[-\d,]+\.\d{2})?(?:\s*(?:CR|DR))?\s*$/i;
    const genericPattern =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+([-\d,]+\.\d{2})\s*(CR|DR)?(?:\s+[-\d,]+\.\d{2})?(?:\s*(?:CR|DR))?\s*$/i;
    const dashPattern =
      /^(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})\s+(.+?)\s+([-\d,]+\.\d{2})(?:\s+[-\d,]+\.\d{2})?\s*$/i;

    // Access Bank Spaceless format
    // Single line: Date[Date]Description[Debit][Credit][Balance]
    const accessSingleLine =
      /^(\d{1,2}-[A-Za-z]{3}-\d{2,4})(?:\d{1,2}-[A-Za-z]{3}-\d{2,4})?(.*?)([\d,]+\.\d{2}|-)([\d,]+\.\d{2}|-)([\d,]+\.\d{2}|-)$/i;
    const accessDateStart =
      /^(\d{1,2}-[A-Za-z]{3}-\d{2,4})(?:\d{1,2}-[A-Za-z]{3}-\d{2,4})?(.*)$/i;
    const accessAmountsEnd =
      /^([\d,]+\.\d{2}|-)([\d,]+\.\d{2}|-)([\d,]+\.\d{2}|-)$/;

    let pendingTx: { date: string; description: string } | null = null;

    for (const line of lines) {
      if (
        line.includes('Opening Balance') ||
        line.includes('Closing Balance') ||
        line.includes('Cleared Balance')
      ) {
        pendingTx = null;
        continue;
      }

      // Try well-spaced GTBank pattern
      const gtMatch = line.match(gtPattern);
      if (gtMatch) {
        const [, date, desc, debit, credit] = gtMatch;
        this.pushAccessRow(rows, date, desc, debit, credit);
        pendingTx = null;
        continue;
      }

      // Try Zenith/Generic
      const genMatch = line.match(genericPattern);
      if (genMatch) {
        const [, date, desc, amountStr, indicator] = genMatch;
        const amount = this.parseAmount(amountStr);
        if (amount > 0) {
          let direction = TransactionDirection.DEBIT;
          if (indicator?.toUpperCase() === 'CR')
            direction = TransactionDirection.CREDIT;
          else if (indicator?.toUpperCase() === 'DR')
            direction = TransactionDirection.DEBIT;
          else {
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
        }
        pendingTx = null;
        continue;
      }

      // Try Dash pattern
      const dashMatch = line.match(dashPattern);
      if (dashMatch) {
        const [, date, desc, amountStr] = dashMatch;
        const amount = this.parseAmount(amountStr);
        if (amount !== 0) {
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
        pendingTx = null;
        continue;
      }

      // Try Access Bank compressed single-line
      const accessSingleMatch = line.match(accessSingleLine);
      if (accessSingleMatch && accessSingleMatch[2].trim() !== '') {
        this.pushAccessRow(
          rows,
          accessSingleMatch[1],
          accessSingleMatch[2],
          accessSingleMatch[3],
          accessSingleMatch[4],
        );
        pendingTx = null;
        continue;
      }

      // Multiline Logic: Start of new transaction
      const dateStartMatch = line.match(accessDateStart);
      if (dateStartMatch) {
        pendingTx = {
          date: dateStartMatch[1],
          description: dateStartMatch[2].trim(),
        };
        continue;
      }

      // Multiline Logic: End of transaction (amounts block)
      const amountsEndMatch = line.match(accessAmountsEnd);
      if (amountsEndMatch && pendingTx) {
        this.pushAccessRow(
          rows,
          pendingTx.date,
          pendingTx.description,
          amountsEndMatch[1],
          amountsEndMatch[2],
        );
        pendingTx = null;
        continue;
      }

      // Multiline Logic: Continuation of description
      if (pendingTx) {
        pendingTx.description += ' ' + line.trim();
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
