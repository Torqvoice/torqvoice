export interface CheckoutRequest {
  amount: number;
  currency: string;
  invoiceNumber: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  serviceRecordId: string;
  orgId: string;
}

export interface CheckoutResult {
  redirectUrl: string;
  externalId: string;
}

export interface VerifyResult {
  paid: boolean;
  amount: number;
}

export interface PaymentProvider {
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  verifyPayment(externalId: string): Promise<VerifyResult | null>;
}
