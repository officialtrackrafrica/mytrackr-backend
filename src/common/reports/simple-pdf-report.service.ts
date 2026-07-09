import { Injectable } from '@nestjs/common';

interface SimplePdfReportInput {
  title: string;
  subtitle?: string;
  lines: string[];
}

@Injectable()
export class SimplePdfReportService {
  private readonly pageWidth = 595;
  private readonly pageHeight = 842;
  private readonly leftMargin = 40;
  private readonly topMargin = 44;
  private readonly lineHeight = 14;
  private readonly maxLinesPerPage = 52;

  generate(input: SimplePdfReportInput): Buffer {
    const allLines = [
      input.title,
      ...(input.subtitle ? [input.subtitle] : []),
      `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
      '',
      ...input.lines,
    ];
    const pages = this.chunk(allLines, this.maxLinesPerPage);
    return this.renderPdf(pages.length > 0 ? pages : [[]]);
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
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    );
    const pageIds: number[] = [];

    pages.forEach((lines, index) => {
      const pageLines = [...lines, '', `Page ${index + 1} of ${pages.length}`];
      const stream = this.renderPageStream(pageLines);
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

  private escapePdfText(value: string): string {
    return String(value || '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }
}
