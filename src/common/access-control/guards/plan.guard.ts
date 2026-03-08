import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PLAN_KEY } from '../decorators/require-plan.decorator';
import { SubscriptionService } from '../../../payments/services/subscription.service';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlans = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPlans) {
      return true; // No plan required for this route
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admins bypass subscription checks
    if (user.role?.name === 'Super Admin' || user.role?.name === 'Admin') {
      return true;
    }

    const { hasActiveSubscription, activePlan } =
      await this.subscriptionService.getUserSubscriptionStatus(user.id);

    if (!hasActiveSubscription || !activePlan) {
      throw new ForbiddenException(
        'This feature requires an active premium subscription.',
      );
    }

    // If specific plans are required, check if they match
    if (requiredPlans.length > 0) {
      const match = requiredPlans.some(
        (planName) =>
          planName.toLowerCase() === activePlan.name.toLowerCase() ||
          planName.toLowerCase() === activePlan.slug.toLowerCase(),
      );

      if (!match) {
        throw new ForbiddenException(
          `This feature requires one of the following plans: ${requiredPlans.join(', ')}`,
        );
      }
    }

    return true;
  }
}
