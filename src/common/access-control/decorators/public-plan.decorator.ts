import { SetMetadata } from '@nestjs/common';
import { REQUIRE_PLAN_KEY } from './require-plan.decorator';

/**
 * Decorator to mark an endpoint as accessible without an active premium plan,
 * even if the controller is protected by PlanGuard at the class level.
 */
export const PublicPlan = () => SetMetadata(REQUIRE_PLAN_KEY, ['PUBLIC']);
