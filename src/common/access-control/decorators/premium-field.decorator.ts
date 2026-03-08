import { SetMetadata } from '@nestjs/common';

export const PREMIUM_FIELD_KEY = 'premiumField';

/**
 * Decorator to mark a class property as a premium feature.
 * The PremiumFieldInterceptor will strip these fields from the response
 * if the user does not have an active premium subscription.
 */
export const PremiumField = () => SetMetadata(PREMIUM_FIELD_KEY, true);
