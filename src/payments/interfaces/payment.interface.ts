export interface InitializePaymentDto {
  amount: number; // In base currency unit (e.g. amount in Kobo for NGN)
  email: string;
  reference: string;
  plan?: string;
  metadata?: Record<string, any>;
}

export interface VerifyPaymentResponse {
  status: 'success' | 'failed' | 'pending';
  amount: number;
  currency: string;
  reference: string;
  gatewayReference?: string;
  customerCode?: string;
  metadata?: Record<string, any>;
  rawResponse: any;
}

export interface PaymentWebhookEvent {
  event: string;
  data: any;
}

export interface IPaymentGateway {
  /**
   * Initializes a payment session and returns a checkout URL or authorization token.
   */
  initializePayment(payload: InitializePaymentDto): Promise<{
    authorizationUrl: string;
    reference: string;
  }>;

  /**
   * Creates a recurring plan on the gateway.
   */
  createPlan(payload: {
    name: string;
    amount: number;
    interval: string;
    currency?: string;
  }): Promise<{ planCode: string }>;

  /**
   * Verifies the status of a transaction after the user completes payment.
   */
  verifyPayment(reference: string): Promise<VerifyPaymentResponse>;

  /**
   * Translates an incoming webhook payload into a standardized event.
   */
  parseWebhookEvent(
    payload: any,
    signatureHeader?: string,
    rawBody?: Buffer,
  ): Promise<PaymentWebhookEvent | null>;
}
