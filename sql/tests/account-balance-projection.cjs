// Build first: npm run build
// Uses the same optional embedded PostgreSQL setup as the cleanup integration checks.
// node sql/tests/account-balance-projection.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { PGlite } = require(path.resolve('.tmp/sql-cleanup-validation/node_modules/@electric-sql/pglite'));
const { TransactionSyncService } = require('../../dist/mono/services/transaction-sync.service');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE mono_accounts ("monoAccountId" text PRIMARY KEY, balance numeric(12,2));
      CREATE TABLE bank_accounts (id text PRIMARY KEY, "providerAccountId" text, "currentBalance" numeric(15,2), "updatedAt" timestamp);
      INSERT INTO mono_accounts VALUES ('one', 12345), ('two', 90000);
      INSERT INTO bank_accounts VALUES ('bank-one','one',10,now()), ('bank-two','two',20,now());
    `);
    const service = Object.assign(Object.create(TransactionSyncService.prototype), {
      bankAccountRepository: { query: (sql, params) => db.query(sql, params) },
    });
    const balance = async id => Number((await db.query('SELECT "currentBalance" FROM bank_accounts WHERE id=$1', [id])).rows[0].currentBalance);

    await service.syncAccountBalance('one');
    assert.equal(await balance('bank-one'), 123.45);
    assert.equal(await balance('bank-two'), 20);
    console.log('PASS major-unit conversion and account isolation using production SQL');

    await db.exec("UPDATE mono_accounts SET balance=0 WHERE \"monoAccountId\"='one'");
    await service.syncAccountBalance('one');
    assert.equal(await balance('bank-one'), 0);
    await db.exec("UPDATE mono_accounts SET balance=-12345 WHERE \"monoAccountId\"='one'");
    await service.syncAccountBalance('one');
    assert.equal(await balance('bank-one'), -123.45);
    await db.exec("UPDATE mono_accounts SET balance=NULL WHERE \"monoAccountId\"='one'");
    await service.syncAccountBalance('one');
    assert.equal(await balance('bank-one'), -123.45);
    console.log('PASS zero balances, overdrafts and preserving a known balance when Mono has none');

    // Snapshot captured before business/profile resolution, then a webhook arrives.
    Object.assign(service, {
      monoAccountRepository: { findOne: async () => ({
        id: 'mono-one', monoAccountId: 'one', balance: 10000, user: { id: 'user' },
      }) },
      businessService: { getBusinessIdForUser: async () => {
        await db.exec("UPDATE mono_accounts SET balance=98765 WHERE \"monoAccountId\"='one'");
        return 'business';
      } },
      bankAccountRepository: {
        query: (sql, params) => db.query(sql, params),
        findOne: async () => ({ id: 'bank-one', businessId: 'business', userId: 'user', currentBalance: 100 }),
        save: () => { throw new Error('Should not save an old account snapshot'); },
      },
      syncWithBankAccount: async () => ({ synced: 0, skipped: null }),
      logger: { log() {}, warn() {} },
    });
    await service.syncAccountTransactions('one');
    assert.equal(await balance('bank-one'), 987.65);
    console.log('PASS transaction projection uses the latest saved webhook balance instead of its earlier snapshot');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
