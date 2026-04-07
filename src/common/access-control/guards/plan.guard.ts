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

    if (!requiredPlans || requiredPlans.includes('PUBLIC')) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (
      Array.isArray(user.roles) &&
      user.roles.some(
        (role: { name?: string }) =>
          role.name === 'Super Admin' || role.name === 'Admin',
      )
    ) {
      return true;
    }

    const { hasActiveSubscription, activePlan } =
      await this.subscriptionService.getUserSubscriptionStatus(user.id);

    if (!hasActiveSubscription || !activePlan) {
      throw new ForbiddenException(
        'This feature requires an active premium subscription.',
      );
    }

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
