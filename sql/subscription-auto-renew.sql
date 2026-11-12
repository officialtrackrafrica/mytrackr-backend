-- Run before deploying when TypeORM schema synchronization is disabled.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS "autoRenew" boolean NOT NULL DEFAULT true;

-- Existing cancellations already have automatic renewal disabled.
UPDATE subscriptions SET "autoRenew" = false WHERE "cancelAtPeriodEnd" = true;
