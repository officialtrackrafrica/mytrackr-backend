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
    const key = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!key) {
      throw new Error(
        'PAYSTACK_SECRET_KEY must be defined in environment properties',
      );
    }
    this.secretKey = key.trim();
  }

  async initializePayment(payload: InitializePaymentDto): Promise<{
    authorizationUrl: string;
    reference: string;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          amount: Math.round(payload.amount), // Paystack expects integer in kobo
          email: payload.email,
          reference: payload.reference,
          plan: payload.plan,
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
        {
          message: 'Payment initialization failed',
          cause: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async createPlan(payload: {
    name: string;
    amount: number;
    interval: string;
    currency?: string;
  }): Promise<{ planCode: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const intervalMapping: Record<string, string> = {
        month: 'monthly',
        monthly: 'monthly',
        year: 'annually',
        yearly: 'annually',
        annually: 'annually',
        week: 'weekly',
        weekly: 'weekly',
        day: 'daily',
        daily: 'daily',
      };

      const paystackInterval =
        intervalMapping[payload.interval.toLowerCase()] || payload.interval;

      const response = await fetch(`${this.baseUrl}/plan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          name: payload.name,
          amount: Math.round(payload.amount * 100),
          interval: paystackInterval,
          currency: payload.currency || 'NGN',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Failed to create Paystack plan');
      }

      return {
        planCode: data.data.plan_code,
      };
    } catch (error) {
      this.logger.error(`Paystack plan creation error: ${error.message}`);
      throw new HttpException(
        {
          message: 'Plan creation failed',
          cause: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
          signal: controller.signal,
        },
      );

      const data = await response.json();

      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Failed to verify transaction');
      }

      const tx = data.data;

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
        {
          message: 'Payment verification failed',
          cause: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async parseWebhookEvent(
    payload: any,
    signatureHeader?: string,
    rawBody?: Buffer,
  ): Promise<PaymentWebhookEvent | null> {
    if (!signatureHeader) {
      throw new HttpException(
        'Missing webhook signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const dataToVerify = rawBody || Buffer.from(JSON.stringify(payload));
    const expectedHash = crypto
      .createHmac('sha512', this.secretKey)
      .update(dataToVerify)
      .digest('hex');

    const received = Buffer.from(signatureHeader, 'utf8');
    const expected = Buffer.from(expectedHash, 'utf8');

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      this.logger.error(`Invalid Paystack webhook signature detected.`);
      throw new HttpException(
        'Invalid webhook signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await Promise.resolve();

    return {
      event: payload.event,
      data: payload.data,
    };
  }
}
