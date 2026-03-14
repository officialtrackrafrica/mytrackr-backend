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

    let hasPremium = false;

    if (user) {
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
          return data;
        }
        return this.stripPremiumFields(data);
      }),
    );
  }

  private stripPremiumFields(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.stripPremiumFields(item));
    }

    if (data !== null && typeof data === 'object') {
      const cleanedData = { ...data };

      const PREMIUM_KEYS = [
        'advancedAnalytics',
        'spendingTrends',
        'predictiveInsights',
        'exportUrl',
        'premiumAnalysis',
      ];

      for (const key of Object.keys(cleanedData)) {
        if (PREMIUM_KEYS.includes(key)) {
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
