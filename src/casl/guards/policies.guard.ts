import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppAbility, CaslAbilityFactory } from '../casl-ability.factory';
import { CHECK_POLICIES_KEY } from '../decorators/check-policies.decorator';
import { PolicyHandler } from '../interfaces/policy-handler.interface';
// import { User } from '../../auth/entities/user.entity';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policyHandlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) || [];

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      console.log('PoliciesGuard: No user found in request');
      return false;
    }

    console.log('PoliciesGuard: User found', {
      id: user.id,
      roles: user.roles?.map((r) => ({
        name: r.name,
        permissions: r.permissions,
      })),
    });

    const ability = this.caslAbilityFactory.createForUser(user);

    return policyHandlers.every((handler) => {
      const result = this.execPolicyHandler(handler, ability);
      console.log('PoliciesGuard: Policy check result', result);
      return result;
    });
  }

  private execPolicyHandler(handler: PolicyHandler, ability: AppAbility) {
    if (typeof handler === 'function') {
      return handler(ability);
    }
    return handler.handle(ability);
  }
}
