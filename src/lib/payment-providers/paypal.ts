import type {
  PaymentProvider,
  CheckoutRequest,
  CheckoutResult,
  VerifyResult,
} from "./types";

interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  useSandbox: boolean;
}

export class PayPalProvider implements PaymentProvider {
  private config: PayPalConfig;
  private baseUrl: string;

  constructor(config: PayPalConfig) {
    this.config = config;
    this.baseUrl = config.useSandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new Error(`PayPal auth failed: ${res.status}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const accessToken = await this.getAccessToken();

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: req.currency,
              value: req.amount.toFixed(2),
            },
            description: req.description,
            invoice_id: req.invoiceNumber,
            custom_id: `${req.serviceRecordId}:${req.orgId}`,
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: `${req.successUrl}?paypal_order_id={order.id}`,
              cancel_url: req.cancelUrl,
              user_action: "PAY_NOW",
              brand_name: req.description.split(" - ")[0] || "Invoice Payment",
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `PayPal order creation failed: ${res.status} ${errorText}`,
      );
    }

    const data = await res.json();

    const approveLink = data.links?.find(
      (l: { rel: string; href: string }) => l.rel === "payer-action",
    );

    if (!approveLink) {
      throw new Error("PayPal did not return a payer-action link");
    }

    return {
      redirectUrl: approveLink.href,
      externalId: data.id,
    };
  }

  async verifyPayment(orderId: string): Promise<VerifyResult | null> {
    try {
      const accessToken = await this.getAccessToken();

      const res = await fetch(
        `${this.baseUrl}/v2/checkout/orders/${orderId}/capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!res.ok) {
        // If already captured, try to get the order details instead
        if (res.status === 422) {
          return await this.getOrderDetails(orderId, accessToken);
        }
        return null;
      }

      const data = await res.json();

      if (data.status === "COMPLETED") {
        const amount = Number.parseFloat(
          data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
            "0",
        );
        return { paid: true, amount };
      }

      return { paid: false, amount: 0 };
    } catch {
      return null;
    }
  }

  private async getOrderDetails(
    orderId: string,
    accessToken: string,
  ): Promise<VerifyResult | null> {
    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${orderId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!res.ok) return null;

    const data = await res.json();

    if (data.status === "COMPLETED") {
      const amount = Number.parseFloat(
        data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
          data.purchase_units?.[0]?.amount?.value ||
          "0",
      );
      return { paid: true, amount };
    }

    return { paid: false, amount: 0 };
  }
}
