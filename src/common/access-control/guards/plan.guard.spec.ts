import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { REQUIRE_CAPABILITY_KEY } from '../decorators/require-capability.decorator';
import { REQUIRE_PLAN_KEY } from '../decorators/require-plan.decorator';
import { PlanGuard } from './plan.guard';

describe('PlanGuard capabilities', () => {
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ id: 'request', user: { id: 'user-1', roles: [] } }),
    }),
  } as unknown as ExecutionContext;

  function createGuard(capabilityEnabled: boolean) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === REQUIRE_CAPABILITY_KEY) return ['tax_estimator'];
        if (key === REQUIRE_PLAN_KEY) return undefined;
        return undefined;
      }),
    };
    const subscriptionService = {
      getUserSubscriptionStatus: jest.fn().mockResolvedValue({
        hasActiveSubscription: true,
        activePlan: {
          slug: 'solo',
          name: 'Solo',
          features: ['tax_estimator'],
          capabilities: { tax_estimator: capabilityEnabled },
        },
      }),
    };

    return new PlanGuard(reflector as any, subscriptionService as any);
  }

  it('allows an enabled capability', async () => {
    await expect(createGuard(true).canActivate(context)).resolves.toBe(true);
  });

  it('denies an explicitly disabled capability', async () => {
    await expect(createGuard(false).canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
