import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { deflateSync, inflateSync } from 'zlib';

interface SimplePdfReportInput {
  title: string;
  subtitle?: string;
  lines: string[];
}

interface PreparedLogo {
  width: number;
  height: number;
  rgb: Buffer;
  alpha: Buffer;
}

type ReportRow =
  | { type: 'section'; label: string }
  | { type: 'amount'; label: string; value: string; emphasis: boolean }
  | { type: 'metric'; label: string; value: string }
  | { type: 'text'; value: string }
  | { type: 'spacer' };

@Injectable()
export class SimplePdfReportService {
  private readonly pageWidth = 595;
  private readonly pageHeight = 842;
  private readonly marginX = 36;
  private readonly headerTop = 792;
  private readonly contentTop = 612;
  private readonly contentBottom = 62;
  private readonly rowHeight = 22;
  private readonly logo = this.loadLogo();

  generate(input: SimplePdfReportInput): Buffer {
    const generatedAt = new Date();
    const parsed = this.parseRows(input.lines);
    const period = this.extractPeriod(parsed);
    const summaryCards = this.buildSummaryCards(parsed);
    const detailRows = this.removeLeadingPeriod(parsed);
    const pages = this.buildPages(
      input,
      generatedAt,
      period,
      summaryCards,
      detailRows,
    );
    return this.renderPdf(pages);
  }

  private buildPages(
    input: SimplePdfReportInput,
    generatedAt: Date,
    period: string | null,
    summaryCards: Array<{ label: string; value: string; color: string }>,
    rows: ReportRow[],
  ): string[][] {
    const pages: string[][] = [];
    let current: string[] = [];
    let y = this.contentTop;

    const startPage = (pageIndex: number) => {
      current = [];
      this.drawHeader(current, input, generatedAt, period, pageIndex === 0);
      if (pageIndex === 0) {
        this.drawSummary(current, summaryCards);
      }
      y = pageIndex === 0 ? this.contentTop : 658;
      this.drawDetailsTitle(current, y + 24);
    };

    startPage(0);

    rows.forEach((row) => {
      const height = this.getRowHeight(row);
      if (y - height < this.contentBottom) {
        this.drawFooter(current, pages.length + 1, 0);
        pages.push(current);
        startPage(pages.length);
      }

      this.drawRow(current, row, y);
      y -= height;
    });

    if (rows.length === 0) {
      this.drawEmptyState(current, y);
    }

    this.drawFooter(current, pages.length + 1, 0);
    pages.push(current);

    return pages.map((page, index) =>
      page.map((command) =>
        command
          .replace(/__TOTAL_PAGES__/g, String(pages.length))
          .replace(/__PAGE_NUMBER__/g, String(index + 1)),
      ),
    );
  }

  private drawHeader(
    commands: string[],
    input: SimplePdfReportInput,
    generatedAt: Date,
    period: string | null,
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

    const cleanTitle = input.title.replace(/^MyTrackr\s+/i, '');
    const titleX = this.logo ? 106 : this.marginX;
    this.text(commands, cleanTitle, titleX, 804, 'F2', 18, '0F172A');
    this.text(
      commands,
      input.subtitle || 'Financial report',
      titleX,
      784,
      'F1',
      10,
      '475569',
    );
    this.text(
      commands,
      period || 'Period: All available data',
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
      isFirstPage ? 'Management report' : 'Continued',
      404,
      790,
      'F2',
      9,
      '0F172A',
    );
  }

  private drawSummary(
    commands: string[],
    cards: Array<{ label: string; value: string; color: string }>,
  ): void {
    const safeCards =
      cards.length > 0
        ? cards.slice(0, 4)
        : [{ label: 'Report', value: 'No summary available', color: '0F172A' }];
    const gap = 10;
    const cardWidth =
      (this.pageWidth - this.marginX * 2 - gap * (safeCards.length - 1)) /
      safeCards.length;

    safeCards.forEach((card, index) => {
      const x = this.marginX + index * (cardWidth + gap);
      this.rect(commands, x, 662, cardWidth, 58, 'FFFFFF', 'E2E8F0');
      this.text(commands, card.label, x + 12, 700, 'F1', 8, '64748B');
      this.text(
        commands,
        this.truncate(card.value, safeCards.length === 1 ? 48 : 19),
        x + 12,
        678,
        'F2',
        safeCards.length === 1 ? 12 : 11,
        card.color,
      );
    });
  }

  private drawDetailsTitle(commands: string[], y: number): void {
    this.text(commands, 'Report Details', this.marginX, y, 'F2', 12, '0F172A');
  }

  private drawRow(commands: string[], row: ReportRow, y: number): void {
    const width = this.pageWidth - this.marginX * 2;

    switch (row.type) {
      case 'section':
        this.rect(commands, this.marginX, y - 13, width, 22, 'ECFDF3');
        this.text(
          commands,
          row.label,
          this.marginX + 10,
          y - 5,
          'F2',
          8,
          '166534',
        );
        break;
      case 'amount':
        this.rect(
          commands,
          this.marginX,
          y - 13,
          width,
          22,
          row.emphasis ? 'F8FAFC' : 'FFFFFF',
          row.emphasis ? 'CBD5E1' : undefined,
        );
        this.text(
          commands,
          this.truncate(row.label, 48),
          this.marginX + 10,
          y - 5,
          row.emphasis ? 'F2' : 'F1',
          8,
          '334155',
        );
        this.text(
          commands,
          this.truncate(row.value, 24),
          this.marginX + 370,
          y - 5,
          row.emphasis ? 'F2' : 'F1',
          8,
          this.getAmountColor(row.value),
        );
        break;
      case 'metric':
        this.rect(commands, this.marginX, y - 13, width, 22, 'FFFFFF');
        this.text(
          commands,
          this.truncate(row.label, 46),
          this.marginX + 10,
          y - 5,
          'F1',
          8,
          '475569',
        );
        this.text(
          commands,
          this.truncate(row.value, 24),
          this.marginX + 370,
          y - 5,
          'F2',
          8,
          this.getMetricColor(row),
        );
        break;
      case 'text':
        this.text(
          commands,
          this.truncate(row.value, 92),
          this.marginX + 10,
          y - 4,
          'F1',
          8,
          '475569',
        );
        break;
      case 'spacer':
        break;
    }
  }

  private drawEmptyState(commands: string[], y: number): void {
    this.rect(
      commands,
      this.marginX,
      y - 30,
      this.pageWidth - this.marginX * 2,
      40,
      'F8FAFC',
    );
    this.text(
      commands,
      'No report rows were generated for the selected filters.',
      this.marginX + 12,
      y - 12,
      'F1',
      9,
      '64748B',
    );
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
      `Page ${page || '__PAGE_NUMBER__'} of ${totalPages || '__TOTAL_PAGES__'}`,
      this.pageWidth - this.marginX - 58,
      26,
      'F1',
      8,
      '64748B',
    );
  }

  private parseRows(lines: string[]): ReportRow[] {
    return lines.map((line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed) {
        return { type: 'spacer' };
      }

      if (/^[A-Z][A-Z\s&]+$/.test(trimmed) && trimmed.length <= 34) {
        return { type: 'section', label: trimmed };
      }

      const amountMatch = trimmed.match(/^(.+?)\.+\s+([A-Z]{3}\s+[-\d,.]+)$/);
      if (amountMatch) {
        const label = amountMatch[1].trim();
        return {
          type: 'amount',
          label,
          value: amountMatch[2].trim(),
          emphasis:
            /^(total|gross profit|net profit|net cash flow|cash balance|monthly burn rate)/i.test(
              label,
            ),
        };
      }

      const metricMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (metricMatch) {
        return {
          type: 'metric',
          label: metricMatch[1].trim(),
          value: metricMatch[2].trim(),
        };
      }

      return { type: 'text', value: trimmed };
    });
  }

  private extractPeriod(rows: ReportRow[]): string | null {
    const period = rows.find(
      (row): row is { type: 'metric'; label: string; value: string } =>
        row.type === 'metric' && row.label.toLowerCase() === 'period',
    );
    return period ? `Period: ${period.value}` : null;
  }

  private removeLeadingPeriod(rows: ReportRow[]): ReportRow[] {
    const copy = [...rows];
    const index = copy.findIndex(
      (row) => row.type === 'metric' && row.label.toLowerCase() === 'period',
    );
    if (index >= 0) {
      copy.splice(index, 1);
      if (copy[index]?.type === 'spacer') {
        copy.splice(index, 1);
      }
    }
    return copy;
  }

  private buildSummaryCards(
    rows: ReportRow[],
  ): Array<{ label: string; value: string; color: string }> {
    const priority = [
      'Total Revenue',
      'Gross Profit',
      'Net Profit',
      'Cash In',
      'Cash Out',
      'Net Cash Flow',
      'Monthly Burn Rate',
      'Cash Balance',
    ];

    const amountRows = rows.filter(
      (
        row,
      ): row is {
        type: 'amount';
        label: string;
        value: string;
        emphasis: boolean;
      } => row.type === 'amount',
    );
    const selected = priority
      .map((label) => amountRows.find((row) => row.label === label))
      .filter(Boolean)
      .slice(0, 4) as Array<{
      type: 'amount';
      label: string;
      value: string;
      emphasis: boolean;
    }>;

    if (selected.length < 4) {
      selected.push(
        ...amountRows
          .filter((row) => !selected.some((item) => item.label === row.label))
          .slice(0, 4 - selected.length),
      );
    }

    return selected.map((row) => ({
      label: row.label,
      value: row.value,
      color: this.getAmountColor(row.value),
    }));
  }

  private getRowHeight(row: ReportRow): number {
    if (row.type === 'spacer') return 10;
    if (row.type === 'section') return 28;
    return this.rowHeight;
  }

  private getAmountColor(value: string): string {
    if (/-/.test(value)) return 'B91C1C';
    return '15803D';
  }

  private getMetricColor(row: { label: string; value: string }): string {
    if (/alert/i.test(row.label)) {
      return /^yes$/i.test(row.value) ? 'B91C1C' : '15803D';
    }
    if (/margin|runway/i.test(row.label)) {
      return '0F172A';
    }
    return '334155';
  }

  private renderPdf(pages: string[][]): Buffer {
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
    pages.forEach((commands) => {
      const stream = commands.join('\n');
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

    objects[1] = `2 0 obj\n<< /Type /Pages\n/Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}]\n/Count ${pageIds.length}\n>>\nendobj\n`;

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
    if (!logoPath) return null;

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

  private formatDateTime(value: Date): string {
    return value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
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
