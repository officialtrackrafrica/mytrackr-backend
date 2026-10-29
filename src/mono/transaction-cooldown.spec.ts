import { buildTransactionSyncCooldown } from './transaction-cooldown';

describe('Transaction refresh cooldown timing', () => {
  const now = new Date('2026-10-29T11:00:00Z');

  it('uses the earliest per-account expiry for the frontend summary', () => {
    const cooldown = buildTransactionSyncCooldown(
      [
        { monoAccountId: 'first', lastSyncedAt: '2026-10-29T10:30:00Z' },
        { monoAccountId: 'second', lastSyncedAt: '2026-10-29T10:45:00Z' },
      ],
      now,
    );
    expect(cooldown).toMatchObject({
      durationSeconds: 3600,
      serverTime: now.toISOString(),
      nextRefreshAt: '2026-10-29T11:30:00.000Z',
      remainingSeconds: 1800,
      isActive: true,
    });
    expect(
      cooldown.accounts.map((account) => account.remainingSeconds),
    ).toEqual([1800, 2700]);
  });

  it('allows a normal request if one account is already eligible', () => {
    const cooldown = buildTransactionSyncCooldown(
      [
        { monoAccountId: 'ready', lastSyncedAt: '2026-10-29T10:00:00Z' },
        { monoAccountId: 'waiting', lastSyncedAt: '2026-10-29T10:45:00Z' },
      ],
      now,
    );
    expect(cooldown).toMatchObject({ remainingSeconds: 0, isActive: false });
    expect(cooldown.accounts[1].isActive).toBe(true);
  });

  it('does not turn missing or invalid timestamps into a new cooldown', () => {
    const cooldown = buildTransactionSyncCooldown(
      [
        { monoAccountId: 'never', lastSyncedAt: null },
        { monoAccountId: 'invalid', lastSyncedAt: 'bad timestamp' },
        { monoAccountId: 'future', lastSyncedAt: '2026-10-30T10:00:00Z' },
        { monoAccountId: 'waiting', lastSyncedAt: '2026-10-29T10:45:00Z' },
      ],
      now,
    );
    expect(cooldown).toMatchObject({
      remainingSeconds: 0,
      nextRefreshAt: null,
      isActive: false,
    });
    expect(
      cooldown.accounts
        .slice(0, 3)
        .every(
          (account) =>
            account.lastSyncedAt === null && account.remainingSeconds === 0,
        ),
    ).toBe(true);
  });

  it('rounds remaining seconds up and expires exactly at one hour', () => {
    const accounts = [
      { monoAccountId: 'first', lastSyncedAt: '2026-10-29T10:00:00Z' },
    ];
    expect(
      buildTransactionSyncCooldown(
        accounts,
        new Date('2026-10-29T10:59:59.999Z'),
      ),
    ).toMatchObject({ remainingSeconds: 1, isActive: true });
    expect(buildTransactionSyncCooldown(accounts, now)).toMatchObject({
      remainingSeconds: 0,
      isActive: false,
    });
    expect(
      buildTransactionSyncCooldown(accounts, new Date('2026-10-29T12:00:00Z')),
    ).toMatchObject({ remainingSeconds: 0, isActive: false });
  });
});
