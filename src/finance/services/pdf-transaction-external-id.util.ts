import { ParsedRow } from './statement-parser.types';

export function buildPdfTransactionExternalIds(
  rows: ParsedRow[],
  businessId: string,
): string[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const baseExternalId =
      row.reference ||
      `pdf:${businessId}:${row.date}:${row.amount}:${row.direction}:${row.description}`;
    const occurrence = seen.get(baseExternalId) || 0;
    seen.set(baseExternalId, occurrence + 1);

    return occurrence === 0
      ? baseExternalId
      : `${baseExternalId}:duplicate-${occurrence + 1}`;
  });
}
