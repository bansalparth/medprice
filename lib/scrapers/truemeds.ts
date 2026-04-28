import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // Truemeds reads pincode from localStorage (`tm_pincode`) and a cookie of the
  // same name. National pricing applies, but stock badges respect this.
  const handle = await newPage({
    cookies: pincode
      ? [{ name: "tm_pincode", value: pincode, domain: ".truemeds.in" }]
      : undefined,
    localStorage: pincode
      ? {
          origin: "https://www.truemeds.in",
          entries: { tm_pincode: pincode, pincode: pincode },
        }
      : undefined,
  });
  try {
    const url = `https://www.truemeds.in/search?searchQuery=${encodeURIComponent(query)}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1000, 2000);

    await handle.page
      .waitForSelector(
        '[class*="product-card"], [class*="ProductCard"], [class*="medicineCard"]',
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
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        '[class*="medicineCard"]',
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
            '[class*="productName"]',
            '[class*="ProductName"]',
            '[class*="product-name"]',
            "h3",
            "h2",
          ]) ?? "";

        const price = parsePrice(
          text([
            '[class*="sellingPrice"]',
            '[class*="discountedPrice"]',
            '[class*="price"]',
          ])
        );
        const mrp = parsePrice(
          text(['[class*="mrp"]', '[class*="MRP"]', '[class*="strikePrice"]', "del"])
        );
        const pack = text([
          '[class*="packSize"]',
          '[class*="PackSize"]',
          '[class*="qty"]',
        ]);
        const salt = text([
          '[class*="salt"]',
          '[class*="composition"]',
          '[class*="Salt"]',
        ]);

        const link =
          (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? "";

        return {
          productName: name,
          saltComposition: salt,
          packSize: pack,
          mrp,
          sellingPrice: price,
          discountPercent:
            mrp && price && mrp > price
              ? Math.round(((mrp - price) / mrp) * 100)
              : undefined,
          inStock: !card.querySelector('[class*="outOfStock"], [class*="OutOfStock"]'),
          productUrl: link.startsWith("http")
            ? link
            : `https://www.truemeds.in${link}`,
          pharmacyName: "truemeds",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
