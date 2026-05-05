import type { Plan } from '../../payments/entities/plan.entity';

export type PlanSlug = 'basic' | 'pro' | 'pro-plus';

export const PLAN_SLUGS: PlanSlug[] = ['basic', 'pro', 'pro-plus'];

export const PLAN_ALIASES: Record<string, PlanSlug> = {
  basic: 'basic',
  free: 'basic',
  pro: 'pro',
  'pro-yearly': 'pro',
  premium: 'pro',
  'premium-yearly': 'pro',
  'pro+': 'pro-plus',
  'pro-plus': 'pro-plus',
  'pro-plus-yearly': 'pro-plus',
  proplus: 'pro-plus',
};

export const PLAN_RANK: Record<PlanSlug, number> = {
  basic: 1,
  pro: 2,
  'pro-plus': 3,
};

export const BANK_ACCOUNT_LIMIT_BY_PLAN: Record<PlanSlug, number> = {
  basic: 0,
  pro: 1,
  'pro-plus': 2,
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
