import type {
  PaymentProvider,
  CheckoutRequest,
  CheckoutResult,
  VerifyResult,
} from "./types";

const VIPPS_API_URL = "https://api.vipps.no";
const VIPPS_TEST_API_URL = "https://apitest.vipps.no";

interface VippsConfig {
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  merchantSerialNumber: string;
  useTestMode: boolean;
}

export class VippsProvider implements PaymentProvider {
  private config: VippsConfig;
  private baseUrl: string;

  constructor(config: VippsConfig) {
    this.config = config;
    this.baseUrl = config.useTestMode ? VIPPS_TEST_API_URL : VIPPS_API_URL;
  }

  private async getAccessToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/accesstoken/get`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        "Ocp-Apim-Subscription-Key": this.config.subscriptionKey,
        "Merchant-Serial-Number": this.config.merchantSerialNumber,
      },
    });

    if (!res.ok) {
      throw new Error(`Vipps auth failed: ${res.status}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const accessToken = await this.getAccessToken();
    const reference = `inv-${req.serviceRecordId}-${Date.now()}`;

    const res = await fetch(`${this.baseUrl}/epayment/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Ocp-Apim-Subscription-Key": this.config.subscriptionKey,
        "Merchant-Serial-Number": this.config.merchantSerialNumber,
        "Idempotency-Key": reference,
      },
      body: JSON.stringify({
        amount: {
          currency: req.currency,
          value: Math.round(req.amount * 100),
        },
        paymentMethod: { type: "WALLET" },
        reference,
        paymentDescription: `Invoice ${req.invoiceNumber}`,
        userFlow: "WEB_REDIRECT",
        returnUrl: `${req.successUrl}?reference=${reference}`,
        metadata: {
          serviceRecordId: req.serviceRecordId,
          orgId: req.orgId,
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Vipps payment creation failed: ${res.status} ${errorText}`);
    }

    const data = await res.json();

    return {
      redirectUrl: data.redirectUrl,
      externalId: reference,
    };
  }

  async verifyPayment(externalId: string): Promise<VerifyResult | null> {
    try {
      const accessToken = await this.getAccessToken();

      const res = await fetch(
        `${this.baseUrl}/epayment/v1/payments/${externalId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Ocp-Apim-Subscription-Key": this.config.subscriptionKey,
            "Merchant-Serial-Number": this.config.merchantSerialNumber,
          },
        },
      );

      if (!res.ok) return null;

      const data = await res.json();
      const paid =
        data.state === "AUTHORIZED" || data.state === "CAPTURED";

      return {
        paid,
        amount: (data.amount?.value ?? 0) / 100,
      };
    } catch {
      return null;
    }
  }
}
