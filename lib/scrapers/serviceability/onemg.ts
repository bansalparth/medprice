import type { ServiceabilityResult } from "../types";

interface OneMgEtaResponse {
  data?: {
    eta_one_liner?: string | null;
    eta_widget?: {
      header?: string; // HTML, e.g. "<span ...>Get in</span> <span ...>30 minutes</span>"
      sub_header?: string | null;
      delivery?: {
        header?: string;
        pincode?: string;
        city?: string;
        text?: string;
      };
      info?: any[];
    };
    pincode?: string;
    city?: string;
    sku_id?: string;
    error?: string | null;
  };
  is_success?: boolean;
  status_code?: number;
  error?: any;
}

/** Strip HTML tags from a string and collapse whitespace. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch the real per-pincode delivery ETA from 1mg's POST endpoint.
 * Endpoint: POST /pharmacy_api_gateway/v4/skus/{skuId}/eta
 * Body:     { pincode, sku_id }
 * Returns the human-readable header text, e.g. "Get in 30 minutes" or
 * "Delivery by tomorrow, 5pm".
 *
 * `productUrl` looks like `/drugs/dolo-650-tablet-74467` — we extract the
 * trailing numeric ID as the sku id.
 */
export async function check(
  productUrl: string,
  pincode: string
): Promise<ServiceabilityResult | null> {
  if (!productUrl.includes("1mg.com")) return null;

  // Extract sku id from URL: /drugs/dolo-650-tablet-74467
  const skuMatch = productUrl.match(/-(\d+)(?:\?|#|$)/);
  if (!skuMatch?.[1]) return null;
  const skuId = skuMatch[1];

  try {
    const r = await fetch(
      `https://www.1mg.com/pharmacy_api_gateway/v4/skus/${skuId}/eta`,
      {
        method: "POST",
        headers: {
          referer: "https://www.1mg.com/",
          "content-type": "application/json",
          "x-city": "Bengaluru",
          "x-pincode": pincode,
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ pincode, sku_id: Number(skuId) }),
        // Manual timeout via AbortController
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!r.ok) return null;
    const data: OneMgEtaResponse = await r.json();
    const widget = data?.data?.eta_widget;
    if (!widget) return null;

    const rawHeader = widget.header?.trim();
    if (!rawHeader) return null;
    const clean = stripHtml(rawHeader);
    if (!clean) return null;

    return {
      inStock: true,
      serviceable: true,
      deliveryEta: clean,
      source: "live",
    };
  } catch {
    return null;
  }
}
