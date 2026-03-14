import { Injectable } from '@nestjs/common';
import { IPaymentGateway } from '../interfaces/payment.interface';
import { PaystackService } from '../providers/paystack.service';

@Injectable()
export class PaymentFactoryService {
  constructor(private readonly paystackService: PaystackService) {}

  getGateway(gatewayName: string): IPaymentGateway {
    if (gatewayName === 'paystack') {
      return this.paystackService;
    }
    throw new Error(`Unsupported payment gateway: ${gatewayName}`);
  }
}
