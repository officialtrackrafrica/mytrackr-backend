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

export const PLAN_CAPABILITY_KEYS = [
  'all_financial_reports',
  'website_linking',
  'upload_bank_statement',
  'automatic_categorization',
  'tax_estimator',
  'paystack_linking',
] as const;

export type PlanCapabilityKey = (typeof PLAN_CAPABILITY_KEYS)[number];

export function planHasCapability(
  activePlan:
    | (Pick<Plan, 'slug' | 'name'> & {
        features?: string[] | null;
        capabilities?: Record<string, any> | null;
      })
    | null
    | undefined,
  capability: string,
) {
  if (!activePlan) return false;

  const capabilities = activePlan.capabilities || {};
  if (Object.prototype.hasOwnProperty.call(capabilities, capability)) {
    return capabilities[capability] === true;
  }

  return (activePlan.features || []).includes(capability);
}

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

export function getPlanBankAccountLimit(
  activePlan:
    | (Pick<Plan, 'slug' | 'name'> & { capabilities?: Record<string, any> | null })
    | null
    | undefined,
) {
  const configuredLimit = Number(activePlan?.capabilities?.bankAccountLimit);
  if (configuredLimit === -1) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (Number.isFinite(configuredLimit) && configuredLimit >= 0) {
    return configuredLimit;
  }

  const planSlug = normalizePlanSlug(activePlan) || 'basic';
  return BANK_ACCOUNT_LIMIT_BY_PLAN[planSlug];
}
