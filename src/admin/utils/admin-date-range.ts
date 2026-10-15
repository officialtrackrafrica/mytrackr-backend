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
  const end = to ? parseAdminEndDate(to) : undefined;

  if (start && end && start > end) {
    throw new BadRequestException('dateFrom must be before dateTo');
  }

  return { start, end };
}

function parseAdminEndDate(value: string): Date {
  const end = parseAdminDate(value, 'dateTo');

  // Date-only end values represent the whole calendar day. Queries use an
  // exclusive upper bound, so normalize them to midnight the following day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  return end;
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
