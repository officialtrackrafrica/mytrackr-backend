import { BadRequestException } from '@nestjs/common';

export interface AdminDateRangeQuery {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdminDateRange {
  start?: Date;
  end?: Date;
}

export function resolveAdminDateRange(
  query: AdminDateRangeQuery,
): AdminDateRange | undefined {
  const from = query.dateFrom || query.startDate;
  const to = query.dateTo || query.endDate;

  if (query.date) {
    const start = parseAdminDate(query.date, 'date');
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (!from && !to) {
    return undefined;
  }

  const start = from ? parseAdminDate(from, 'dateFrom') : undefined;
  const end = to ? parseAdminDate(to, 'dateTo') : undefined;

  if (start && end && start > end) {
    throw new BadRequestException('dateFrom must be before dateTo');
  }

  return { start, end };
}

function parseAdminDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return date;
}

export function serializeAdminDateRange(
  query: AdminDateRangeQuery,
  range?: AdminDateRange,
) {
  return {
    date: query.date,
    dateFrom: range?.start?.toISOString(),
    dateTo: range?.end?.toISOString(),
  };
}
