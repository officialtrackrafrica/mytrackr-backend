import { MonoTransaction } from './entities/transaction.entity';

// A missing balance is a distinct value: match another missing balance, never zero.
function fingerprint(tx: {
  date: unknown;
  amount: unknown;
  balance: unknown;
  type: unknown;
  currency?: unknown;
  narration?: unknown;
}): string | null {
  if (
    tx.amount === null ||
    tx.amount === undefined ||
    tx.amount === '' ||
    !tx.date
  )
    return null;
  const amount = Number(tx.amount);
  const balanceMissing =
    tx.balance === null || tx.balance === undefined || tx.balance === '';
  const balance = balanceMissing ? null : Number(tx.balance);
  const date = new Date(tx.date as string | Date).getTime();
  if (
    !Number.isSafeInteger(amount) ||
    (balance !== null && !Number.isSafeInteger(balance)) ||
    !Number.isFinite(date) ||
    !tx.type ||
    !String(tx.narration || '').trim()
  )
    return null;
  return JSON.stringify([
    date,
    amount,
    balance,
    String(tx.type).toLowerCase(),
    String(tx.currency || 'NGN').toUpperCase(),
    String(tx.narration).trim().replace(/\s+/g, ' '),
  ]);
}

/** Reconcile one complete account download, preserving identical occurrences. */
export function reconcileMonoTransactions(
  incoming: any[],
  existing: MonoTransaction[],
): {
  transactions: any[];
  aliases: Array<{ id: string; providerIdAliases: string[] }>;
} {
  const byProviderId = new Map<string, MonoTransaction>();
  const byFingerprint = new Map<string, MonoTransaction[]>();
  // Prefer the oldest stored occurrence without merging existing records.
  const ordered = [...existing].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const row of ordered) {
    for (const id of [
      row.monoTransactionId,
      ...(row.providerIdAliases || []),
    ]) {
      const previous = byProviderId.get(id);
      if (previous && previous.id !== row.id)
        throw new Error('Conflicting Mono transaction aliases');
      byProviderId.set(id, row);
    }
    const key = fingerprint(row);
    if (key) byFingerprint.set(key, [...(byFingerprint.get(key) || []), row]);
  }
  const unique = [
    ...new Map(incoming.map((tx) => [tx.id || tx._id, tx])).values(),
  ];
  // Reserve known IDs first, even when they appear on a later page.
  const used = new Set(
    unique.map((tx) => byProviderId.get(tx.id || tx._id)?.id).filter(Boolean),
  );
  const aliases = new Map<
    string,
    { id: string; providerIdAliases: string[] }
  >();
  const transactions: any[] = [];
  for (const tx of unique) {
    const providerId = tx.id || tx._id;
    let row = byProviderId.get(providerId);
    if (!row) {
      const key = fingerprint(tx);
      row = key
        ? byFingerprint.get(key)?.find((candidate) => !used.has(candidate.id))
        : undefined;
      if (row) {
        used.add(row.id);
        const update = aliases.get(row.id) || {
          id: row.id,
          providerIdAliases: [...(row.providerIdAliases || [])],
        };
        update.providerIdAliases.push(providerId);
        aliases.set(row.id, update);
        byProviderId.set(providerId, row);
      }
    }
    if (row?.deletedAt) continue;
    // Keep the canonical ID stable so finance externalId and manual categories survive.
    transactions.push(row ? { ...tx, id: row.monoTransactionId } : tx);
  }
  return {
    transactions: [
      ...new Map(transactions.map((tx) => [tx.id || tx._id, tx])).values(),
    ],
    aliases: [...aliases.values()],
  };
}
