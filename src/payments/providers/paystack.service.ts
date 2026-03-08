import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPaymentGateway,
  InitializePaymentDto,
  VerifyPaymentResponse,
  PaymentWebhookEvent,
} from '../interfaces/payment.interface';
import * as crypto from 'crypto';

@Injectable()
export class PaystackService implements IPaymentGateway {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    if (!this.secretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY is not defined in environment properties',
      );
    }
  }

  async initializePayment(payload: InitializePaymentDto): Promise<{
    authorizationUrl: string;
    reference: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: payload.amount, // Paystack expects integer in kobo
          email: payload.email,
          reference: payload.reference,
          metadata: payload.metadata,
          callback_url: this.configService.get<string>('PAYSTACK_CALLBACK_URL'),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        throw new Error(
          data.message || 'Failed to initialize Paystack transaction',
        );
      }

      return {
        authorizationUrl: data.data.authorization_url,
        reference: data.data.reference,
      };
    } catch (error) {
      this.logger.error(`Paystack initialization error: ${error.message}`);
      throw new HttpException(
        'Payment initialization failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Failed to verify transaction');
      }

      const tx = data.data;

      // Map Paystack status to standard status
      let mappedStatus: 'success' | 'failed' | 'pending' = 'pending';
      if (tx.status === 'success') mappedStatus = 'success';
      else if (tx.status === 'failed' || tx.status === 'abandoned')
        mappedStatus = 'failed';

      return {
        status: mappedStatus,
        amount: tx.amount,
        currency: tx.currency,
        reference: tx.reference,
        gatewayReference: tx.id.toString(),
        customerCode: tx.customer?.customer_code,
        metadata: tx.metadata,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Paystack verification error: ${error.message}`);
      throw new HttpException(
        'Payment verification failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  parseWebhookEvent(
    payload: any,
    signatureHeader?: string,
  ): Promise<PaymentWebhookEvent | null> {
    // Verify signature
    if (signatureHeader) {
      const hash = crypto
        .createHmac('sha512', this.secretKey)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (hash !== signatureHeader) {
        this.logger.error('Invalid Paystack webhook signature detected');
        return Promise.resolve(null);
      }
    }

    return Promise.resolve({
      event: payload.event,
      data: payload.data,
    });
  }
}
