// Synthetic PostgreSQL integration checks, with no live database connection.
// npm install --prefix .tmp/sql-cleanup-validation --no-save --ignore-scripts @electric-sql/pglite
// node sql/tests/cleanup-mono-repeat-imports.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve('.tmp/sql-cleanup-validation/node_modules/@electric-sql/pglite'));
const script = fs.readFileSync(path.join(__dirname, '../cleanup-mono-repeat-imports.sql'), 'utf8');
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// Interpret just the psql commands used by the cleanup, so the SQL itself runs
// unmodified on PostgreSQL. Variable quoting follows psql's :'name' syntax.
function compile(variables = {}) {
  const vars = { email: 'cleanup-test@example.com', ...variables };
  const stack = [];
  const output = [];
  const active = () => stack.every(frame => frame.active);
  for (const line of script.split(/\r?\n/)) {
    const directive = line.trim();
    if (directive.startsWith('\\if ')) {
      const condition = directive.slice(4).trim();
      const exists = condition.match(/^:\{\?(\w+)\}$/);
      const truth = exists ? Object.hasOwn(vars, exists[1]) : /^(true|on|1)$/i.test(vars[condition.slice(1)]);
      stack.push({ truth, active: truth });
    } else if (directive === '\\else') {
      stack.at(-1).active = !stack.at(-1).truth;
    } else if (directive === '\\endif') {
      stack.pop();
    } else if (!active()) {
      continue;
    } else if (directive.startsWith('\\set ')) {
      const [, name, value] = directive.match(/^\\set\s+(\w+)\s+(.+)$/);
      vars[name] = value.replace(/^'(.*)'$/, '$1');
    } else if (directive.startsWith('\\')) {
      assert.match(directive, /^\\(pset|echo)\b/);
    } else if (line.includes('\\gset')) {
      vars.cleanup_run_id = uuid(99999);
      output.push(`SELECT '${vars.cleanup_run_id}'::uuid AS cleanup_run_id;`);
    } else {
      output.push(line.replace(/:'(\w+)'/g, (_, name) => {
        assert.ok(Object.hasOwn(vars, name), `Undefined psql variable ${name}`);
        return `'${String(vars[name]).replaceAll("'", "''")}'`;
      }));
    }
  }
  assert.equal(stack.length, 0);
  return output.join('\n');
}

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id uuid PRIMARY KEY, email text);
    CREATE TABLE mono_accounts (id uuid PRIMARY KEY, "userId" uuid, "monoAccountId" text);
    CREATE TABLE bank_accounts (id uuid PRIMARY KEY, "providerAccountId" text);
    CREATE TABLE mono_transactions (
      id uuid PRIMARY KEY, "monoAccountId" uuid, "monoTransactionId" text,
      "providerIdAliases" jsonb NOT NULL DEFAULT '[]',
      date timestamptz, amount bigint, balance bigint, type text, currency text,
      narration text, "categorySource" text, "manualCategory" text, "manualSubCategory" text,
      "createdAt" timestamp, "updatedAt" timestamp, "deletedAt" timestamp
    );
    CREATE TABLE transactions (
      id uuid PRIMARY KEY, "externalId" text UNIQUE, "userId" varchar,
      "bankAccountId" uuid, "businessId" varchar, date date, amount numeric,
      direction text, description text, "categorySource" text, category text,
      "manualCategory" text, "manualSubCategory" text, notes text,
      "createdAt" timestamp, "updatedAt" timestamp, "deletedAt" timestamp
    );
    CREATE TABLE disputes ("transactionId" text);
    INSERT INTO users VALUES ('${uuid(1)}', 'cleanup-test@example.com'), ('${uuid(2)}', 'other@example.com');
    INSERT INTO mono_accounts VALUES ('${uuid(10)}','${uuid(1)}','account-one'), ('${uuid(20)}','${uuid(2)}','account-two');
    INSERT INTO bank_accounts VALUES ('${uuid(11)}','account-one'), ('${uuid(21)}','account-two');
  `);
  let sequence = 100;
  const added = [];
  async function add(group, original, overrides = {}) {
    const index = sequence++;
    const rawId = uuid(index);
    const financeId = uuid(index + 10000);
    const other = overrides.other || false;
    const narration = overrides.narration || `Payment ${group}`;
    const date = overrides.date || '2026-10-18T23:00:00Z';
    const created = overrides.created || (original ? '2026-10-19T15:17:12Z' : '2026-10-29T11:37:18Z');
    const providerId = `provider-${index}`;
    await db.query(`INSERT INTO mono_transactions
      (id,"monoAccountId","monoTransactionId","providerIdAliases",date,amount,balance,type,currency,narration,
       "categorySource","manualCategory","createdAt","updatedAt")
      VALUES($1,$2,$3,$4,$5,290000,$6,'credit',$7,$8,'MONO',NULL,$9,$9)`,
    [rawId, uuid(other ? 20 : 10), providerId, JSON.stringify(overrides.aliases || []), date,
      overrides.balance ?? null, overrides.currency || 'NGN', narration, created]);
    if (!overrides.noFinance) {
      await db.query(`INSERT INTO transactions
        (id,"externalId","userId","bankAccountId","businessId",date,amount,direction,description,
         "categorySource",category,"manualCategory","createdAt","updatedAt")
        VALUES($1,$2,$3,$4,'business','2026-10-18',$5,'CREDIT',$6,$7,$8,$8,$9,$9)`,
      [financeId, `mono_${providerId}`, uuid(other ? 2 : 1), uuid(other ? 21 : 11),
        overrides.financeAmount || 2900, narration,
        original || overrides.manual ? 'MANUAL' : 'MONO',
        original || overrides.manual ? 'Income' : null, created]);
    }
    const row = { rawId, financeId, providerId, group, original };
    added.push(row);
    return row;
  }
  const firstOriginal = await add('null', true);
  const firstDuplicate = await add('null', false, { aliases: ['another-regenerated-id'] });
  await add('repeated', true);
  await add('repeated', true);
  await add('repeated', false);
  await add('repeated', false);
  await add('repeated', false); // A third occurrence must remain.
  await add('zero', true, { balance: 0 });
  await add('zero', false);
  await add('known', true, { balance: 100 });
  await add('known', false, { balance: 101 });
  await add('manual', true);
  await add('manual', false, { manual: true });
  await add('finance-difference', true);
  await add('finance-difference', false, { financeAmount: 1 });
  await add('missing-finance', true, { noFinance: true });
  await add('missing-finance', false);
  await add('whitespace', true, { narration: 'Payment   whitespace' });
  await add('whitespace', false, { narration: ' Payment whitespace ' });
  await add('time', true);
  await add('time', false, { date: '2026-10-18T23:00:01Z' });
  await add('currency', true);
  await add('currency', false, { currency: 'USD' });
  await add('outside-date', true);
  await add('outside-date', false, { created: '2026-10-30T11:37:18Z' });
  await add('other-user', true, { other: true });
  await add('other-user', false, { other: true });
  return { db, added, firstOriginal, firstDuplicate };
}

async function snapshot(db) {
  return {
    raw: (await db.query('SELECT * FROM mono_transactions ORDER BY id')).rows,
    finance: (await db.query('SELECT * FROM transactions ORDER BY id')).rows,
  };
}

(async () => {
  const { db, added, firstOriginal, firstDuplicate } = await fixture();
  try {
    const before = await snapshot(db);
    const preview = await db.exec(compile());
    const summary = preview.flatMap(result => result.rows).find(row => 'safe_pairs' in row);
    assert.equal(Number(summary.safe_pairs), 4);
    assert.equal(Number(summary.needs_manual_review), 3);
    assert.deepEqual(await snapshot(db), before, 'Preview must not persist changes');
    assert.equal((await db.query("SELECT to_regclass('transaction_duplicate_cleanup_backups') AS t")).rows[0].t, null);
    console.log('PASS preview: missing balances, multiplicity, changed details, other users, incident date and manual edits');

    await assert.rejects(db.exec(compile({ apply: true, expected_pairs: 5 })), /expected_pairs/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), before);
    console.log('PASS incorrect expected count rolls back without changes');

    await db.exec(compile({ apply: true, expected_pairs: 4 }));
    const after = await snapshot(db);
    assert.equal(after.raw.length, before.raw.length - 4);
    assert.equal(after.finance.length, before.finance.length);
    assert.equal(after.finance.filter(row => row.deletedAt).length, 4);
    const retained = after.raw.find(row => row.id === firstOriginal.rawId);
    assert.deepEqual(retained.providerIdAliases.sort(), [firstDuplicate.providerId, 'another-regenerated-id'].sort());
    for (const original of added.filter(row => row.original && before.finance.some(f => f.id === row.financeId))) {
      assert.deepEqual(after.finance.find(row => row.id === original.financeId), before.finance.find(row => row.id === original.financeId));
    }
    assert.equal(after.raw.filter(row => row.narration === 'Payment repeated').length, 3);
    assert.equal(Number((await db.query('SELECT count(*) n FROM transaction_duplicate_cleanup_backups')).rows[0].n), 16);
    for (const removed of before.raw.filter(row => !after.raw.some(kept => kept.id === row.id))) {
      const backup = (await db.query("SELECT record FROM transaction_duplicate_cleanup_backups WHERE source_table='mono_transactions' AND record_id=$1", [removed.id])).rows[0];
      assert.equal(backup.record.monoTransactionId, removed.monoTransactionId);
    }
    console.log('PASS apply: alias transfer, original categories, occurrence counts, both tables and full-row backups');

    await assert.rejects(db.exec(compile({ apply: true, expected_pairs: 1 })), /already has a committed cleanup/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), after);
    console.log('PASS repeated cleanup is blocked before changing legitimate leftover occurrences');
  } finally { await db.close(); }

  const conflict = await fixture();
  try {
    await conflict.db.query('UPDATE mono_transactions SET "providerIdAliases"=$1 WHERE id=$2',
      [JSON.stringify([conflict.firstDuplicate.providerId]), conflict.added.find(row => row.group === 'zero' && row.original).rawId]);
    const before = await snapshot(conflict.db);
    await assert.rejects(conflict.db.exec(compile({ apply: true, expected_pairs: 4 })), /Conflicting provider aliases/);
    await conflict.db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(conflict.db), before);
    console.log('PASS alias conflicts abort the entire cleanup without changes');
  } finally { await conflict.db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
