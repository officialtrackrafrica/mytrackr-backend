import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { deflateSync, inflateSync } from 'zlib';
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
  commands: string[];
}

interface PreparedLogo {
  width: number;
  height: number;
  rgb: Buffer;
  alpha: Buffer;
}

@Injectable()
export class TransactionReportPdfService {
  private readonly pageWidth = 595;
  private readonly pageHeight = 842;
  private readonly marginX = 36;
  private readonly headerTop = 792;
  private readonly rowHeight = 22;
  private readonly tableTop = 600;
  private readonly tableBottom = 62;
  private readonly rowsPerPage = Math.floor(
    (this.tableTop - this.tableBottom - 24) / this.rowHeight,
  );
  private readonly logo = this.loadLogo();

  generate(input: TransactionReportPdfInput): Buffer {
    const generatedAt = input.generatedAt || new Date();
    const pages = this.buildPages(input, generatedAt);
    return this.renderPdf(pages);
  }

  private buildPages(
    input: TransactionReportPdfInput,
    generatedAt: Date,
  ): PdfPage[] {
    const chunks = this.chunk(input.transactions, this.rowsPerPage);
    const safeChunks = chunks.length > 0 ? chunks : [[]];

    return safeChunks.map((chunk, pageIndex) => {
      const commands: string[] = [];
      const isFirstPage = pageIndex === 0;

      this.drawHeader(commands, input, generatedAt, isFirstPage);
      if (isFirstPage) {
        this.drawSummary(commands, input);
      }
      this.drawTable(commands, chunk, input.currency);
      this.drawFooter(commands, pageIndex + 1, safeChunks.length);

      return { commands };
    });
  }

  private drawHeader(
    commands: string[],
    input: TransactionReportPdfInput,
    generatedAt: Date,
    isFirstPage: boolean,
  ): void {
    this.rect(commands, 0, 755, this.pageWidth, 87, 'F7FAFC');
    this.rect(commands, 0, 752, this.pageWidth, 3, '16A34A');

    if (this.logo) {
      const logoWidth = 58;
      const logoHeight = (this.logo.height / this.logo.width) * logoWidth;
      commands.push(
        `q ${this.num(logoWidth)} 0 0 ${this.num(logoHeight)} ${this.marginX} ${this.num(
          this.headerTop - logoHeight + 6,
        )} cm /ImLogo Do Q`,
      );
    } else {
      this.text(commands, 'MyTrackr', this.marginX, 794, 'F2', 20, '15803D');
    }

    const titleX = this.logo ? 106 : this.marginX;
    this.text(commands, 'Transaction Report', titleX, 804, 'F2', 18, '0F172A');
    this.text(
      commands,
      input.businessName || 'Business',
      titleX,
      784,
      'F1',
      10,
      '475569',
    );
    this.text(
      commands,
      `Period: ${this.formatPeriod(input.startDate, input.endDate)}`,
      titleX,
      770,
      'F1',
      9,
      '64748B',
    );

    this.text(
      commands,
      `Generated ${this.formatDateTime(generatedAt)}`,
      404,
      804,
      'F1',
      8,
      '64748B',
    );
    this.text(
      commands,
      isFirstPage ? 'Detailed transaction export' : 'Continued',
      404,
      790,
      'F2',
      9,
      '0F172A',
    );
  }

  private drawSummary(
    commands: string[],
    input: TransactionReportPdfInput,
  ): void {
    const cards = [
      {
        label: 'Transactions',
        value: this.formatInteger(input.totalTransactions),
        color: '0F172A',
      },
      {
        label: 'Credits',
        value: this.formatMoney(input.totalCredits, input.currency),
        color: '15803D',
      },
      {
        label: 'Debits',
        value: this.formatMoney(input.totalDebits, input.currency),
        color: 'B91C1C',
      },
      {
        label: 'Net',
        value: this.formatMoney(input.netTotal, input.currency),
        color: input.netTotal >= 0 ? '15803D' : 'B91C1C',
      },
    ];

    const gap = 10;
    const cardWidth = (this.pageWidth - this.marginX * 2 - gap * 3) / 4;

    cards.forEach((card, index) => {
      const x = this.marginX + index * (cardWidth + gap);
      this.rect(commands, x, 662, cardWidth, 58, 'FFFFFF', 'E2E8F0');
      this.text(commands, card.label, x + 12, 700, 'F1', 8, '64748B');
      this.text(
        commands,
        this.truncate(card.value, index === 0 ? 14 : 19),
        x + 12,
        678,
        'F2',
        index === 0 ? 15 : 11,
        card.color,
      );
    });
  }

  private drawTable(
    commands: string[],
    transactions: Transaction[],
    currency: string,
  ): void {
    const tableX = this.marginX;
    const tableWidth = this.pageWidth - this.marginX * 2;
    this.text(commands, 'Transactions', tableX, 622, 'F2', 12, '0F172A');

    this.rect(commands, tableX, this.tableTop - 4, tableWidth, 24, '0F172A');
    this.text(
      commands,
      'Date',
      tableX + 10,
      this.tableTop + 4,
      'F2',
      8,
      'FFFFFF',
    );
    this.text(
      commands,
      'Type',
      tableX + 72,
      this.tableTop + 4,
      'F2',
      8,
      'FFFFFF',
    );
    this.text(
      commands,
      'Amount',
      tableX + 122,
      this.tableTop + 4,
      'F2',
      8,
      'FFFFFF',
    );
    this.text(
      commands,
      'Category',
      tableX + 212,
      this.tableTop + 4,
      'F2',
      8,
      'FFFFFF',
    );
    this.text(
      commands,
      'Description',
      tableX + 330,
      this.tableTop + 4,
      'F2',
      8,
      'FFFFFF',
    );

    if (transactions.length === 0) {
      this.rect(commands, tableX, this.tableTop - 38, tableWidth, 34, 'F8FAFC');
      this.text(
        commands,
        'No transactions found for the selected filters.',
        tableX + 12,
        this.tableTop - 26,
        'F1',
        9,
        '64748B',
      );
      return;
    }

    transactions.forEach((tx, index) => {
      const y = this.tableTop - 26 - index * this.rowHeight;
      this.rect(
        commands,
        tableX,
        y - 7,
        tableWidth,
        this.rowHeight,
        index % 2 === 0 ? 'FFFFFF' : 'F8FAFC',
      );
      this.line(commands, tableX, y - 7, tableX + tableWidth, y - 7, 'E2E8F0');

      const directionColor = tx.direction === 'CREDIT' ? '15803D' : 'B91C1C';
      this.text(
        commands,
        this.formatDate(tx.date),
        tableX + 10,
        y,
        'F1',
        8,
        '334155',
      );
      this.text(
        commands,
        tx.direction,
        tableX + 72,
        y,
        'F2',
        8,
        directionColor,
      );
      this.text(
        commands,
        this.truncate(this.formatMoney(Number(tx.amount || 0), currency), 18),
        tableX + 122,
        y,
        'F1',
        8,
        '0F172A',
      );
      this.text(
        commands,
        this.truncate(tx.subCategory || tx.category || 'Uncategorised', 20),
        tableX + 212,
        y,
        'F1',
        8,
        '334155',
      );
      this.text(
        commands,
        this.truncate(tx.description || tx.name || tx.externalId || '', 43),
        tableX + 330,
        y,
        'F1',
        8,
        '334155',
      );
    });
  }

  private drawFooter(
    commands: string[],
    page: number,
    totalPages: number,
  ): void {
    this.line(
      commands,
      this.marginX,
      43,
      this.pageWidth - this.marginX,
      43,
      'E2E8F0',
    );
    this.text(commands, 'MyTrackr', this.marginX, 26, 'F2', 8, '15803D');
    this.text(
      commands,
      `Page ${page} of ${totalPages}`,
      this.pageWidth - this.marginX - 48,
      26,
      'F1',
      8,
      '64748B',
    );
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
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    );
    this.addObject(
      objects,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    );

    let logoImageId: number | null = null;
    let logoMaskId: number | null = null;
    if (this.logo) {
      const alpha = deflateSync(this.logo.alpha).toString('latin1');
      logoMaskId = this.addObject(
        objects,
        [
          `<< /Type /XObject /Subtype /Image /Width ${this.logo.width} /Height ${this.logo.height}`,
          '/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode',
          `/Length ${Buffer.byteLength(alpha, 'latin1')} >>`,
          'stream',
          alpha,
          'endstream',
        ].join('\n'),
      );

      const rgb = deflateSync(this.logo.rgb).toString('latin1');
      logoImageId = this.addObject(
        objects,
        [
          `<< /Type /XObject /Subtype /Image /Width ${this.logo.width} /Height ${this.logo.height}`,
          '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode',
          `/SMask ${logoMaskId} 0 R`,
          `/Length ${Buffer.byteLength(rgb, 'latin1')} >>`,
          'stream',
          rgb,
          'endstream',
        ].join('\n'),
      );
    }

    const pageIds: number[] = [];
    pages.forEach((page) => {
      const stream = page.commands.join('\n');
      const contentId = this.addObject(
        objects,
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
      );
      const xObjectResources = logoImageId
        ? `/XObject << /ImLogo ${logoImageId} 0 R >>`
        : '';
      const pageId = this.addObject(
        objects,
        [
          '<< /Type /Page',
          '/Parent 2 0 R',
          `/MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}]`,
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjectResources} >>`,
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

  private loadLogo(): PreparedLogo | null {
    const candidates = [
      join(process.cwd(), 'src', 'public', 'mytrackr-logo.png'),
      join(process.cwd(), 'dist', 'public', 'mytrackr-logo.png'),
    ];
    const logoPath = candidates.find((candidate) => existsSync(candidate));
    if (!logoPath) {
      return null;
    }

    try {
      return this.preparePngLogo(readFileSync(logoPath), 160);
    } catch {
      return null;
    }
  }

  private preparePngLogo(buffer: Buffer, targetWidth: number): PreparedLogo {
    if (buffer.toString('ascii', 1, 4) !== 'PNG') {
      throw new Error('Unsupported image format');
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idatChunks: Buffer[] = [];

    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const data = buffer.subarray(dataStart, dataEnd);

      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      } else if (type === 'IEND') {
        break;
      }

      offset = dataEnd + 4;
    }

    if (bitDepth !== 8 || colorType !== 6 || width === 0 || height === 0) {
      throw new Error('Unsupported PNG encoding');
    }

    const rgba = this.decodeRgbaPng(
      inflateSync(Buffer.concat(idatChunks)),
      width,
      height,
    );
    const targetHeight = Math.max(
      1,
      Math.round((height / width) * targetWidth),
    );
    const resized = this.resizeRgbaNearest(
      rgba,
      width,
      height,
      targetWidth,
      targetHeight,
    );
    const rgb = Buffer.alloc(targetWidth * targetHeight * 3);
    const alpha = Buffer.alloc(targetWidth * targetHeight);

    for (let i = 0, p = 0, a = 0; i < resized.length; i += 4, p += 3, a++) {
      rgb[p] = resized[i];
      rgb[p + 1] = resized[i + 1];
      rgb[p + 2] = resized[i + 2];
      alpha[a] = resized[i + 3];
    }

    return { width: targetWidth, height: targetHeight, rgb, alpha };
  }

  private decodeRgbaPng(data: Buffer, width: number, height: number): Buffer {
    const bytesPerPixel = 4;
    const stride = width * bytesPerPixel;
    const output = Buffer.alloc(stride * height);
    let inputOffset = 0;

    for (let y = 0; y < height; y++) {
      const filter = data[inputOffset++];
      const row = data.subarray(inputOffset, inputOffset + stride);
      inputOffset += stride;
      const outOffset = y * stride;
      const previousOffset = y > 0 ? outOffset - stride : -1;

      for (let x = 0; x < stride; x++) {
        const left =
          x >= bytesPerPixel ? output[outOffset + x - bytesPerPixel] : 0;
        const up = previousOffset >= 0 ? output[previousOffset + x] : 0;
        const upLeft =
          previousOffset >= 0 && x >= bytesPerPixel
            ? output[previousOffset + x - bytesPerPixel]
            : 0;
        const raw = row[x];

        switch (filter) {
          case 0:
            output[outOffset + x] = raw;
            break;
          case 1:
            output[outOffset + x] = (raw + left) & 0xff;
            break;
          case 2:
            output[outOffset + x] = (raw + up) & 0xff;
            break;
          case 3:
            output[outOffset + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
            break;
          case 4:
            output[outOffset + x] =
              (raw + this.paethPredictor(left, up, upLeft)) & 0xff;
            break;
          default:
            throw new Error('Unsupported PNG filter');
        }
      }
    }

    return output;
  }

  private resizeRgbaNearest(
    rgba: Buffer,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
  ): Buffer {
    const output = Buffer.alloc(targetWidth * targetHeight * 4);

    for (let y = 0; y < targetHeight; y++) {
      const sourceY = Math.min(
        sourceHeight - 1,
        Math.floor((y * sourceHeight) / targetHeight),
      );
      for (let x = 0; x < targetWidth; x++) {
        const sourceX = Math.min(
          sourceWidth - 1,
          Math.floor((x * sourceWidth) / targetWidth),
        );
        const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
        const targetOffset = (y * targetWidth + x) * 4;
        rgba.copy(output, targetOffset, sourceOffset, sourceOffset + 4);
      }
    }

    return output;
  }

  private paethPredictor(left: number, up: number, upLeft: number): number {
    const p = left + up - upLeft;
    const pa = Math.abs(p - left);
    const pb = Math.abs(p - up);
    const pc = Math.abs(p - upLeft);
    if (pa <= pb && pa <= pc) return left;
    if (pb <= pc) return up;
    return upLeft;
  }

  private rect(
    commands: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
  ): void {
    const paintCommand = stroke ? `${this.color(stroke)} RG 0.6 w B` : 'f';
    commands.push(
      `q ${this.color(fill)} rg ${this.num(x)} ${this.num(y)} ${this.num(
        width,
      )} ${this.num(height)} re ${paintCommand} Q`,
    );
  }

  private line(
    commands: string[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
  ): void {
    commands.push(
      `q ${this.color(stroke)} RG 0.5 w ${this.num(x1)} ${this.num(y1)} m ${this.num(
        x2,
      )} ${this.num(y2)} l S Q`,
    );
  }

  private text(
    commands: string[],
    value: string,
    x: number,
    y: number,
    font: 'F1' | 'F2',
    size: number,
    fill: string,
  ): void {
    commands.push(
      `BT ${this.color(fill)} rg /${font} ${this.num(size)} Tf ${this.num(
        x,
      )} ${this.num(y)} Td (${this.escapePdfText(value)}) Tj ET`,
    );
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
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Until ${endDate}`;
    return 'All time';
  }

  private formatDate(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  private formatDateTime(value: Date): string {
    return value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
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

  private formatInteger(value: number): string {
    return value.toLocaleString('en-US');
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

  private color(hex: string): string {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    return `${this.num(r)} ${this.num(g)} ${this.num(b)}`;
  }

  private num(value: number): string {
    return Number(value.toFixed(3)).toString();
  }
}
