import { Injectable, NotFoundException } from '@nestjs/common';
import { IPaymentGateway } from '../interfaces/payment.interface';
import { PaystackService } from '../providers/paystack.service';

@Injectable()
export class PaymentFactoryService {
  constructor(private readonly paystackService: PaystackService) {}

  /**
   * Retrieves the strategy for a particular payment gateway.
   * Enables easy expansion (e.g., adding Stripe or Flutterwave by injecting them here).
   */
  getGateway(providerName: string): IPaymentGateway {
    switch (providerName.toLowerCase()) {
      case 'paystack':
        return this.paystackService;
      default:
        throw new NotFoundException(
          `Payment gateway provider '${providerName}' is not supported.`,
        );
    }
  }
}
