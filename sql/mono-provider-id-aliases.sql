-- Apply before deploying the transaction identity fix if schema synchronization
-- is disabled. This adds alias storage without modifying existing transactions.
-- With the current TypeORM synchronize=true setting, startup adds it automatically.
-- Docker deployment (from the repository root, using a POSIX shell):
-- docker exec -i mytrackr-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < sql/mono-provider-id-aliases.sql
--
-- Imports preserve the canonical Mono ID (and finance/category references),
-- storing regenerated IDs as aliases. Matching is account-scoped and requires
-- the full timestamp, amount, direction, currency, whitespace-normalized
-- narration and running balance. Two missing balances match, but a missing
-- balance never matches zero or a known balance. Other incomplete identities
-- use ID matching only.
-- Complete downloads are matched one occurrence at a time under an account row
-- lock; existing duplicate rows are not merged or removed by this migration.
-- Account history and downloaded pages are buffered in memory for matching.
BEGIN;
ALTER TABLE mono_transactions
  ADD COLUMN IF NOT EXISTS "providerIdAliases" jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
