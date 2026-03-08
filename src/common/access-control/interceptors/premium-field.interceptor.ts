import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SubscriptionService } from '../../../payments/services/subscription.service';

@Injectable()
export class PremiumFieldInterceptor implements NestInterceptor {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check if user has premium access (fetch status from DB)
    let hasPremium = false;

    if (user) {
      // Admins always have premium access
      if (user.role?.name === 'Super Admin' || user.role?.name === 'Admin') {
        hasPremium = true;
      } else {
        const { hasActiveSubscription } =
          await this.subscriptionService.getUserSubscriptionStatus(user.id);
        hasPremium = hasActiveSubscription;
      }
    }

    return next.handle().pipe(
      map((data) => {
        if (hasPremium || !data) {
          return data; // Return full data for premium users
        }
        return this.stripPremiumFields(data); // Strip specific fields for free users
      }),
    );
  }

  private stripPremiumFields(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.stripPremiumFields(item));
    }

    if (data !== null && typeof data === 'object') {
      const cleanedData = { ...data };

      // In a real implementation mapping back to DTO metadata would be required.
      // But for a fast MVP, we often use explicit naming conventions
      // or check prototype metadata if class-transformer is fully used.
      // For simplicity in this interceptor, if a key is named starting with 'premium'
      // or we define a hardcoded list of premium keys here (or from Reflector).

      const PREMIUM_KEYS = [
        'advancedAnalytics',
        'spendingTrends',
        'predictiveInsights',
        'exportUrl',
        'premiumAnalysis',
      ];

      for (const key of Object.keys(cleanedData)) {
        if (PREMIUM_KEYS.includes(key)) {
          // Alternatively, return null or a prompt
          cleanedData[key] = {
            error: 'Premium Feature',
            message: 'Upgrade to a premium plan to view this data.',
            requiresUpgrade: true,
          };
        } else if (
          typeof cleanedData[key] === 'object' &&
          cleanedData[key] !== null
        ) {
          cleanedData[key] = this.stripPremiumFields(cleanedData[key]);
        }
      }
      return cleanedData;
    }

    return data;
  }
}
