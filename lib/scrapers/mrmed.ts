import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // MrMed: national pricing, no per-pincode personalization on search page.
  // We still seed the cookie so future product-page scrapes can read it.
  const handle = await newPage({
    cookies: pincode
      ? [{ name: "pincode", value: pincode, domain: ".mrmed.in" }]
      : undefined,
  });
  try {
    const url = `https://www.mrmed.in/search?q=${encodeURIComponent(query)}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1000, 2000);

    await handle.page
      .waitForSelector(
        '.product-card, [data-testid="product-card"], [class*="ProductCard"]',
        { timeout: 12000 }
      )
      .catch(() => {});

    const results = await safeEvaluate(handle.page, () => {
      const parsePrice = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const n = parseFloat(s.replace(/[^0-9.]/g, ""));
        return isNaN(n) || n <= 0 ? undefined : n;
      };

      const cardSelectors = [
        '.product-card',
        '[data-testid="product-card"]',
        '[class*="ProductCard"]',
        '[class*="product-item"]',
      ];
      let cards: Element[] = [];
      for (const sel of cardSelectors) {
        cards = Array.from(document.querySelectorAll(sel));
        if (cards.length) break;
      }

      return cards.slice(0, 5).map((card) => {
        const text = (sels: string[]): string | undefined => {
          for (const s of sels) {
            const el = card.querySelector(s);
            const t = el?.textContent?.trim();
            if (t) return t;
          }
          return undefined;
        };

        const name =
          text([
            ".product-title",
            '[class*="productName"]',
            '[class*="ProductName"]',
            "h3",
            "h4",
          ]) ?? "";

        const price = parsePrice(
          text([
            ".price",
            ".selling-price",
            '[class*="sellingPrice"]',
            '[class*="discountedPrice"]',
          ])
        );
        const mrp = parsePrice(
          text([".mrp", ".original-price", '[class*="mrp"]', "del"])
        );
        const pack = text(['[class*="packSize"]', '[class*="quantity"]']);

        const link =
          (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? "";

        return {
          productName: name,
          packSize: pack,
          mrp,
          sellingPrice: price,
          discountPercent:
            mrp && price && mrp > price
              ? Math.round(((mrp - price) / mrp) * 100)
              : undefined,
          inStock: true,
          productUrl: link.startsWith("http") ? link : `https://www.mrmed.in${link}`,
          pharmacyName: "mrmed",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
