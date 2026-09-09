export interface CheckoutRequest {
  amount: number
  currency: string
  invoiceNumber: string
  description: string
  successUrl: string
  cancelUrl: string
  serviceRecordId: string
  orgId: string
}

export interface CheckoutResult {
  redirectUrl: string
  externalId: string
}

export interface VerifyResult {
  paid: boolean
  amount: number
  /**
   * Who the order was created for, as the vendor hands it back with the
   * verified order. Null when the vendor returned no attribution; a caller
   * must treat that as a mismatch rather than trust the request.
   */
  serviceRecordId?: string | null
  organizationId?: string | null
}

export interface PaymentProvider {
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>
  verifyPayment(externalId: string): Promise<VerifyResult | null>
}
