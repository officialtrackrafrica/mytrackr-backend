import type { Plan } from '../../payments/entities/plan.entity';

export type PlanSlug =
  | 'basic'
  | 'starter'
  | 'web'
  | 'solo'
  | 'duo'
  | 'unlimited';

export const PLAN_SLUGS: PlanSlug[] = [
  'basic',
  'starter',
  'web',
  'solo',
  'duo',
  'unlimited',
];

export const PLAN_ALIASES: Record<string, PlanSlug> = {
  basic: 'basic',
  free: 'basic',
  starter: 'starter',
  web: 'web',
  solo: 'solo',
  duo: 'duo',
  unlimited: 'unlimited',
  pro: 'solo',
  'pro-yearly': 'solo',
  premium: 'solo',
  'premium-yearly': 'solo',
  'pro+': 'duo',
  'pro-plus': 'duo',
  'pro-plus-yearly': 'duo',
  proplus: 'duo',
};

export const PLAN_RANK: Record<PlanSlug, number> = {
  basic: 1,
  starter: 2,
  web: 2,
  solo: 2,
  duo: 3,
  unlimited: 4,
};

export const BANK_ACCOUNT_LIMIT_BY_PLAN: Record<PlanSlug, number> = {
  basic: 0,
  starter: 0,
  web: 0,
  solo: 1,
  duo: 2,
  unlimited: Number.MAX_SAFE_INTEGER,
};

export function normalizePlanSlug(plan?: Pick<Plan, 'slug' | 'name'> | null) {
  const rawSlug = plan?.slug?.toLowerCase();
  const rawName = plan?.name?.toLowerCase();
  return (
    (rawSlug && PLAN_ALIASES[rawSlug]) ||
    (rawName && PLAN_ALIASES[rawName]) ||
    null
  );
}

export function normalizeRequiredPlan(planName: string) {
  return PLAN_ALIASES[planName.toLowerCase()] || null;
}

export function planHasAccess(
  activePlan: Pick<Plan, 'slug' | 'name'> | null | undefined,
  requiredPlanName: string,
) {
  const activeSlug = normalizePlanSlug(activePlan);
  const requiredSlug = normalizeRequiredPlan(requiredPlanName);

  if (!activeSlug || !requiredSlug) {
    return false;
  }

  return PLAN_RANK[activeSlug] >= PLAN_RANK[requiredSlug];
}
