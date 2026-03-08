import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PLAN_KEY = 'requirePlan';

/**
 * Decorator to restrict access to users on specific plans.
 * If no plan is specified, it just requires the user to have ANY active subscription.
 *
 * @param planNames Names of the plans allowed (e.g., 'Premium', 'Pro')
 */
export const RequirePlan = (...planNames: string[]) =>
  SetMetadata(REQUIRE_PLAN_KEY, planNames);
