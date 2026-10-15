import { resolveAdminDateRange } from './admin-date-range';

describe('resolveAdminDateRange', () => {
  it('includes the full end date when dateTo is date-only', () => {
    expect(
      resolveAdminDateRange({
        dateFrom: '2025-10-15',
        dateTo: '2026-10-15',
      }),
    ).toEqual({
      start: new Date('2025-10-15T00:00:00.000Z'),
      end: new Date('2026-10-16T00:00:00.000Z'),
    });
  });

  it('keeps an explicit end timestamp as the exclusive boundary', () => {
    expect(
      resolveAdminDateRange({
        dateFrom: '2026-10-15T08:00:00.000Z',
        dateTo: '2026-10-15T12:30:00.000Z',
      }),
    ).toEqual({
      start: new Date('2026-10-15T08:00:00.000Z'),
      end: new Date('2026-10-15T12:30:00.000Z'),
    });
  });
});
