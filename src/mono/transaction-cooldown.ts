export const TRANSACTION_SYNC_COOLDOWN_SECONDS = 60 * 60;

export interface AccountTransactionCooldown {
  accountId: string;
  lastSyncedAt: string | null;
  nextRefreshAt: string | null;
  remainingSeconds: number;
  isActive: boolean;
}

export interface TransactionSyncCooldown {
  durationSeconds: number;
  serverTime: string;
  nextRefreshAt: string | null;
  remainingSeconds: number;
  isActive: boolean;
  accounts: AccountTransactionCooldown[];
}

export function buildTransactionSyncCooldown(
  accounts: Array<{
    monoAccountId: string;
    lastSyncedAt?: Date | string | null;
  }>,
  now = new Date(),
): TransactionSyncCooldown {
  const timings = accounts.map((account) => {
    const last = account.lastSyncedAt
      ? new Date(account.lastSyncedAt).getTime()
      : NaN;
    const valid = Number.isFinite(last) && last <= now.getTime();
    const next = valid ? last + TRANSACTION_SYNC_COOLDOWN_SECONDS * 1000 : null;
    const remainingSeconds =
      next === null ? 0 : Math.max(0, Math.ceil((next - now.getTime()) / 1000));
    return {
      accountId: account.monoAccountId,
      lastSyncedAt: valid ? new Date(last).toISOString() : null,
      nextRefreshAt: next === null ? null : new Date(next).toISOString(),
      remainingSeconds,
      isActive: remainingSeconds > 0,
    };
  });
  // The summary describes the earliest account eligible for a normal refresh.
  const earliest =
    timings.length && timings.every((account) => account.nextRefreshAt !== null)
      ? timings.reduce((a, b) => (a.nextRefreshAt! < b.nextRefreshAt! ? a : b))
      : null;
  return {
    durationSeconds: TRANSACTION_SYNC_COOLDOWN_SECONDS,
    serverTime: now.toISOString(),
    nextRefreshAt: earliest?.nextRefreshAt ?? null,
    remainingSeconds: earliest?.remainingSeconds ?? 0,
    isActive:
      timings.length > 0 && timings.every((account) => account.isActive),
    accounts: timings,
  };
}
