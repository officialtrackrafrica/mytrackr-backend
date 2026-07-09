import { Injectable } from '@nestjs/common';
import { Transaction } from '../entities/transaction.entity';

interface TransactionReportPdfInput {
  businessName: string;
  currency: string;
  transactions: Transaction[];
  totalTransactions: number;
  totalCredits: number;
  totalDebits: number;
  netTotal: number;
  startDate?: string;
  endDate?: string;
  generatedAt?: Date;
}

interface PdfPage {
  lines: string[];
}

@Injectable()
export class TransactionReportPdfService {
  private readonly pageWidth = 595;
  private readonly pageHeight = 842;
  private readonly leftMargin = 40;
  private readonly topMargin = 44;
  private readonly lineHeight = 14;
  private readonly rowsPerPage = 34;

  generate(input: TransactionReportPdfInput): Buffer {
    const generatedAt = input.generatedAt || new Date();
    const pages = this.buildPages(input, generatedAt);
    return this.renderPdf(pages);
  }

  private buildPages(
    input: TransactionReportPdfInput,
    generatedAt: Date,
  ): PdfPage[] {
    const pages: PdfPage[] = [];
    const rows = input.transactions.map((tx) => this.formatTransactionRow(tx));
    const chunks = this.chunk(rows, this.rowsPerPage);
    const safeChunks = chunks.length > 0 ? chunks : [[]];

    safeChunks.forEach((chunk, index) => {
      const lines: string[] = [];

      if (index === 0) {
        lines.push('MyTrackr Transaction Report');
        lines.push(`Business: ${input.businessName || 'Business'}`);
        lines.push(
          `Period: ${this.formatPeriod(input.startDate, input.endDate)}`,
        );
        lines.push(`Generated: ${this.formatDateTime(generatedAt)}`);
        lines.push('');
        lines.push(`Transactions: ${input.totalTransactions}`);
        lines.push(
          `Credits: ${this.formatMoney(input.totalCredits, input.currency)}`,
        );
        lines.push(
          `Debits: ${this.formatMoney(input.totalDebits, input.currency)}`,
        );
        lines.push(`Net: ${this.formatMoney(input.netTotal, input.currency)}`);
        lines.push('');
      } else {
        lines.push('MyTrackr Transaction Report');
        lines.push(`Business: ${input.businessName || 'Business'}`);
        lines.push('');
      }

      lines.push(
        'Date       Type   Amount          Category       Description',
      );
      lines.push(
        '---------- ------ --------------- -------------- ------------------------------',
      );

      if (chunk.length === 0) {
        lines.push('No transactions found for the selected filters.');
      } else {
        lines.push(...chunk);
      }

      lines.push('');
      lines.push(`Page ${index + 1} of ${safeChunks.length}`);
      pages.push({ lines });
    });

    return pages;
  }

  private formatTransactionRow(tx: Transaction): string {
    const date = this.pad(this.formatDate(tx.date), 10);
    const direction = this.pad(tx.direction, 6);
    const amount = this.padStart(this.formatNumber(Number(tx.amount || 0)), 15);
    const category = this.pad(
      this.truncate(tx.subCategory || tx.category || 'Uncategorised', 14),
      14,
    );
    const description = this.truncate(
      tx.description || tx.name || tx.externalId || '',
      30,
    );

    return `${date} ${direction} ${amount} ${category} ${description}`;
  }

  private renderPdf(pages: PdfPage[]): Buffer {
    const objects: string[] = [];
    const catalogId = this.addObject(
      objects,
      '<< /Type /Catalog /Pages 2 0 R >>',
    );
    this.addObject(objects, '');
    this.addObject(
      objects,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    );
    const pageIds: number[] = [];

    pages.forEach((page) => {
      const stream = this.renderPageStream(page.lines);
      const contentId = this.addObject(
        objects,
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
      );
      const pageId = this.addObject(
        objects,
        [
          '<< /Type /Page',
          '/Parent 2 0 R',
          `/MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}]`,
          '/Resources << /Font << /F1 3 0 R >> >>',
          `/Contents ${contentId} 0 R`,
          '>>',
        ].join('\n'),
      );
      pageIds.push(pageId);
    });

    const pagesObject = [
      '<< /Type /Pages',
      `/Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}]`,
      `/Count ${pageIds.length}`,
      '>>',
    ].join('\n');

    objects[1] = `2 0 obj\n${pagesObject}\nendobj\n`;

    const header = '%PDF-1.4\n';
    let body = '';
    const offsets = [0];

    objects.forEach((object) => {
      offsets.push(Buffer.byteLength(header + body, 'latin1'));
      body += object;
    });

    const xrefOffset = Buffer.byteLength(header + body, 'latin1');
    const xref = [
      `xref\n0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF',
    ].join('\n');

    return Buffer.from(header + body + xref, 'latin1');
  }

  private renderPageStream(lines: string[]): string {
    const commands = [
      'BT',
      '/F1 10 Tf',
      `${this.leftMargin} ${this.pageHeight - this.topMargin} Td`,
    ];

    lines.forEach((line, index) => {
      if (index > 0) {
        commands.push(`0 -${this.lineHeight} Td`);
      }
      commands.push(`(${this.escapePdfText(line)}) Tj`);
    });

    commands.push('ET');
    return commands.join('\n');
  }

  private addObject(objects: string[], content: string): number {
    const id = objects.length + 1;
    objects.push(`${id} 0 obj\n${content}\nendobj\n`);
    return id;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private formatPeriod(startDate?: string, endDate?: string): string {
    if (startDate && endDate) {
      return `${startDate} to ${endDate}`;
    }
    if (startDate) {
      return `From ${startDate}`;
    }
    if (endDate) {
      return `Until ${endDate}`;
    }
    return 'All time';
  }

  private formatDate(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().slice(0, 10);
  }

  private formatDateTime(value: Date): string {
    return value.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }

  private formatMoney(amount: number, currency: string): string {
    return `${currency || 'NGN'} ${this.formatNumber(amount)}`;
  }

  private formatNumber(amount: number): string {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private pad(value: string, length: number): string {
    return this.truncate(value, length).padEnd(length, ' ');
  }

  private padStart(value: string, length: number): string {
    return this.truncate(value, length).padStart(length, ' ');
  }

  private truncate(value: string, length: number): string {
    const ascii = this.toAscii(value);
    return ascii.length > length ? ascii.slice(0, length - 1) + '.' : ascii;
  }

  private toAscii(value: string): string {
    return String(value || '').replace(/[^\x20-\x7E]/g, ' ');
  }

  private escapePdfText(value: string): string {
    return this.toAscii(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }
}
