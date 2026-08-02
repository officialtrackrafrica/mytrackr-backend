import { SetMetadata } from '@nestjs/common';
import type { PlanCapabilityKey } from '../plan-entitlements';

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';

export const RequireCapability = (...capabilities: PlanCapabilityKey[]) =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, capabilities);
