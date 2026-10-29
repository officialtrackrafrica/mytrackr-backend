-- Run with psql, not by pasting into a non-psql SQL editor.
-- Default: preview only, then ROLLBACK. No persistent changes.
-- Deploy the fixed importer and providerIdAliases column before applying.
-- Scope defaults to the incident below; the date does NOT advance with today.
-- Apply requires BOTH -v apply=true AND -v expected_pairs=<preview safe_pairs>.
-- Repeat imports with fully identical fields remain heuristic candidates; review
-- the preview before applying. Original occurrence counts are preserved.
\set ON_ERROR_STOP on
\pset pager off
\if :{?email}
\else
  \set email 'kafarunifemi@gmail.com'
\endif
\if :{?cleanup_date}
\else
  \set cleanup_date '2026-10-29'
\endif
\if :{?apply}
\else
  \set apply false
\endif
\if :{?expected_pairs}
\else
  \set expected_pairs 0
\endif

BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _cleanup_scope ON COMMIT DROP AS
SELECT id AS user_id, email,
       :'cleanup_date'::date AS incident_date,
       :'cleanup_date'::date::timestamp AT TIME ZONE 'Africa/Lagos' AS starts_at,
       (:'cleanup_date'::date + 1)::timestamp AT TIME ZONE 'Africa/Lagos' AS ends_at,
       :'expected_pairs'::integer AS expected_pairs
FROM users WHERE lower(email) = lower(:'email');

DO $$
BEGIN
  IF (SELECT count(*) FROM _cleanup_scope) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one matching user';
  END IF;
END $$;

-- Same lock order as the importer. The table locks also protect finance writes
-- performed outside the account import transaction. Reads can continue.
SELECT a.id AS locked_account
FROM mono_accounts a JOIN _cleanup_scope s ON s.user_id = a."userId"
ORDER BY a.id FOR UPDATE OF a;
LOCK TABLE mono_transactions, transactions IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  -- Do not pair a leftover legitimate occurrence with the same originals on a
  -- second pass. Each reviewed incident may be applied only once.
  IF to_regclass('transaction_duplicate_cleanup_backups') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM transaction_duplicate_cleanup_backups b
      JOIN _cleanup_scope s ON lower(b.email) = lower(s.email)
        AND b.incident_date = s.incident_date
    ) THEN
      RAISE EXCEPTION 'This user/date incident already has a committed cleanup; review its backups instead of applying another pass';
    END IF;
  END IF;
END $$;

-- createdAt is stored as UTC by this application. SET TIME ZONE above makes
-- casting its timestamp-without-time-zone columns deterministic.
CREATE TEMP TABLE _cleanup_raw_pairs ON COMMIT DROP AS
WITH source AS (
  SELECT t.*,
    t."createdAt"::timestamptz < s.starts_at AS is_original,
    jsonb_build_array(
      t."monoAccountId", t.date, t.amount, lower(t.type),
      upper(coalesce(t.currency, 'NGN')),
      regexp_replace(trim(t.narration), '\s+', ' ', 'g'), t.balance
    ) AS identity_key
  FROM mono_transactions t
  JOIN mono_accounts a ON a.id = t."monoAccountId"
  JOIN _cleanup_scope s ON s.user_id = a."userId"
  WHERE t."deletedAt" IS NULL
    AND t."createdAt"::timestamptz < s.ends_at
    AND t.date IS NOT NULL AND t.amount IS NOT NULL
    AND trim(t.narration) <> '' AND trim(t.type) <> ''
), ranked AS (
  SELECT *, row_number() OVER (
    PARTITION BY identity_key, is_original ORDER BY "createdAt", id
  ) AS occurrence
  FROM source
)
SELECT original.id AS keep_id, added.id AS drop_id,
       original."monoAccountId" AS account_id,
       original."monoTransactionId" AS keep_provider_id,
       added."monoTransactionId" AS drop_provider_id
FROM ranked original
JOIN ranked added ON added.identity_key = original.identity_key
  AND added.occurrence = original.occurrence
WHERE original.is_original AND NOT added.is_original;

-- Skip pairs with missing/inconsistent finance mirrors or user edits on the
-- duplicate. Retained rows and all their category fields are left untouched.
CREATE TEMP TABLE _cleanup_review ON COMMIT DROP AS
SELECT p.*, kept.id AS keep_finance_id, added.id AS drop_finance_id,
  CASE
    WHEN kept.id IS NULL OR added.id IS NULL THEN 'missing active finance mirror'
    WHEN kept."bankAccountId" IS DISTINCT FROM added."bankAccountId"
      OR kept."businessId" IS DISTINCT FROM added."businessId"
      OR kept.date IS DISTINCT FROM added.date
      OR kept.amount IS DISTINCT FROM added.amount
      OR kept.direction IS DISTINCT FROM added.direction
      OR regexp_replace(trim(kept.description), '\s+', ' ', 'g')
         IS DISTINCT FROM regexp_replace(trim(added.description), '\s+', ' ', 'g')
      OR NOT EXISTS (
        SELECT 1 FROM bank_accounts ba JOIN mono_accounts a
          ON a."monoAccountId" = ba."providerAccountId"
        WHERE ba.id = kept."bankAccountId" AND a.id = p.account_id
      ) THEN 'finance mirrors differ or belong to another account'
    WHEN added."categorySource"::text = 'MANUAL'
      OR added."manualCategory" IS NOT NULL OR added."manualSubCategory" IS NOT NULL
      OR nullif(trim(added.notes), '') IS NOT NULL
      OR raw."categorySource"::text = 'MANUAL'
      OR raw."manualCategory" IS NOT NULL OR raw."manualSubCategory" IS NOT NULL
      THEN 'duplicate has user edits or notes; review manually'
    WHEN EXISTS (
      SELECT 1 FROM disputes d WHERE d."transactionId"::text = raw.id::text
    ) THEN 'bank duplicate has a dispute reference; review manually'
    ELSE NULL
  END AS review_reason
FROM _cleanup_raw_pairs p
CROSS JOIN _cleanup_scope s
JOIN mono_transactions raw ON raw.id = p.drop_id
LEFT JOIN transactions kept ON kept."externalId" = 'mono_' || p.keep_provider_id
  AND kept."userId" = s.user_id::text AND kept."deletedAt" IS NULL
LEFT JOIN transactions added ON added."externalId" = 'mono_' || p.drop_provider_id
  AND added."userId" = s.user_id::text AND added."deletedAt" IS NULL;

CREATE TEMP TABLE _cleanup_pairs ON COMMIT DROP AS
SELECT * FROM _cleanup_review WHERE review_reason IS NULL;

SELECT (SELECT email FROM _cleanup_scope) AS email,
       (SELECT incident_date FROM _cleanup_scope) AS incident_date_lagos,
       count(*) AS matching_pairs,
       count(*) FILTER (WHERE review_reason IS NULL) AS safe_pairs,
       count(*) FILTER (WHERE review_reason IS NOT NULL) AS needs_manual_review
FROM _cleanup_review;

SELECT review_reason, count(*) FROM _cleanup_review
WHERE review_reason IS NOT NULL GROUP BY review_reason;

SELECT p.keep_id, p.drop_id, t.date AS full_bank_timestamp,
       t.amount AS amount_in_kobo, t.balance, t.narration
FROM _cleanup_pairs p JOIN mono_transactions t ON t.id = p.drop_id
ORDER BY t.date DESC, p.drop_id LIMIT 20;

\if :apply
  -- Requiring the reviewed count prevents applying an unexpected selection.
  DO $$
  BEGIN
    IF (SELECT count(*) FROM _cleanup_pairs) = 0 OR
       (SELECT count(*) FROM _cleanup_pairs) <>
       (SELECT expected_pairs FROM _cleanup_scope) THEN
      RAISE EXCEPTION 'Set expected_pairs to the positive safe_pairs count from the preview';
    END IF;
  END $$;

  -- Plan transferred IDs and detect any conflicting ownership before writing.
  CREATE TEMP TABLE _cleanup_aliases ON COMMIT DROP AS
  SELECT p.keep_id, p.account_id, raw."monoTransactionId" AS alias
  FROM _cleanup_pairs p JOIN mono_transactions raw ON raw.id = p.drop_id
  UNION
  SELECT p.keep_id, p.account_id, alias.value
  FROM _cleanup_pairs p JOIN mono_transactions raw ON raw.id = p.drop_id
  CROSS JOIN LATERAL jsonb_array_elements_text(raw."providerIdAliases") AS alias(value);

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM _cleanup_aliases a JOIN _cleanup_aliases b
      ON a.account_id = b.account_id AND a.alias = b.alias AND a.keep_id <> b.keep_id
    ) OR EXISTS (
      SELECT 1 FROM _cleanup_aliases alias JOIN mono_transactions other
      ON other."monoAccountId" = alias.account_id AND other.id <> alias.keep_id
        AND (other."monoTransactionId" = alias.alias OR other."providerIdAliases" ? alias.alias)
      WHERE NOT EXISTS (SELECT 1 FROM _cleanup_pairs p WHERE p.drop_id = other.id)
    ) THEN
      RAISE EXCEPTION 'Conflicting provider aliases; no cleanup applied';
    END IF;
  END $$;

  SELECT gen_random_uuid() AS cleanup_run_id \gset
  CREATE TABLE IF NOT EXISTS transaction_duplicate_cleanup_backups (
    run_id uuid NOT NULL,
    source_table text NOT NULL,
    record_id uuid NOT NULL,
    record_role text NOT NULL,
    email text NOT NULL,
    incident_date date NOT NULL,
    backed_up_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    record jsonb NOT NULL,
    PRIMARY KEY (run_id, source_table, record_id)
  );

  -- Back up originals AND duplicates, including aliases and all category fields.
  INSERT INTO transaction_duplicate_cleanup_backups
    (run_id, source_table, record_id, record_role, email, incident_date, record)
  SELECT :'cleanup_run_id'::uuid, 'mono_transactions', t.id,
         CASE WHEN t.id = p.keep_id THEN 'retained' ELSE 'removed' END,
         s.email, s.incident_date, to_jsonb(t)
  FROM _cleanup_pairs p JOIN mono_transactions t ON t.id IN (p.keep_id, p.drop_id)
  CROSS JOIN _cleanup_scope s
  UNION ALL
  SELECT :'cleanup_run_id'::uuid, 'transactions', t.id,
         CASE WHEN t.id = p.keep_finance_id THEN 'retained' ELSE 'soft_deleted' END,
         s.email, s.incident_date, to_jsonb(t)
  FROM _cleanup_pairs p JOIN transactions t ON t.id IN (p.keep_finance_id, p.drop_finance_id)
  CROSS JOIN _cleanup_scope s;

  UPDATE mono_transactions kept
  SET "providerIdAliases" = (
    SELECT coalesce(jsonb_agg(DISTINCT ids.value ORDER BY ids.value), '[]'::jsonb)
    FROM (
      SELECT value FROM jsonb_array_elements_text(kept."providerIdAliases")
      UNION
      SELECT alias FROM _cleanup_aliases a WHERE a.keep_id = kept.id
    ) ids WHERE ids.value <> kept."monoTransactionId"
  ), "updatedAt" = clock_timestamp()
  WHERE EXISTS (SELECT 1 FROM _cleanup_pairs p WHERE p.keep_id = kept.id);

  -- Finance extras stay recoverable, with their IDs and any references intact.
  UPDATE transactions t
  SET "deletedAt" = clock_timestamp(), "updatedAt" = clock_timestamp()
  FROM _cleanup_pairs p WHERE t.id = p.drop_finance_id;

  -- Raw extras must be removed after alias transfer. Keeping raw tombstones
  -- would make their canonical IDs conflict with the retained row's aliases.
  DELETE FROM mono_transactions t USING _cleanup_pairs p WHERE t.id = p.drop_id;

  SELECT :'cleanup_run_id' AS backup_run_id,
         count(*) AS removed_bank_records_and_hidden_finance_copies
  FROM _cleanup_pairs;
  COMMIT;
\else
  ROLLBACK;
  \echo 'Preview only: no records changed. Review safe_pairs, then rerun with -v apply=true -v expected_pairs=THE_REVIEWED_COUNT.'
\endif
