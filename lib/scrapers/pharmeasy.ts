import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // PharmEasy persists the user's pincode in a `currentZipCode` cookie which
  // drives serviceability + delivery widgets across the site.
  const handle = await newPage({
    cookies: pincode
      ? [
          { name: "currentZipCode", value: pincode, domain: ".pharmeasy.in" },
          { name: "pincode", value: pincode, domain: ".pharmeasy.in" },
        ]
      : undefined,
  });
  try {
    const url = `https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1500, 2500);

    await handle.page
      .waitForSelector('[class*="ProductCard_medicineUnitContainer"]', {
        timeout: 12000,
      })
      .catch(() => {});

    await handle.page.evaluate(() => window.scrollTo(0, 600));
    await jitter(800, 1200);

    const results = await safeEvaluate(handle.page, () => {
      const parsePrice = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const cleaned = s.replace(/\*/g, "").replace(/[^0-9.]/g, "");
        const n = parseFloat(cleaned);
        return isNaN(n) || n <= 0 ? undefined : n;
      };

      const cards = Array.from(
        document.querySelectorAll('[class*="ProductCard_medicineUnitContainer"]')
      );

      return cards.slice(0, 6).map((card) => {
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
            '[class*="ProductCard_medicineName"]',
            '[class*="medicineName"]',
            "h1",
            "h2",
            "h3",
          ]) ?? "";

        const brand = text([
          '[class*="ProductCard_brandName"]',
          '[class*="ProductCard_manufacturerName"]',
        ]);

        const salt = text([
          '[class*="ProductCard_saltComposition"]',
          '[class*="saltComposition"]',
        ]);

        const pack = text([
          '[class*="ProductCard_measurementUnit"]',
          '[class*="measurementUnit"]',
          '[class*="ProductCard_packSize"]',
        ]);

        // Selling price (with optional asterisk)
        const sellingPrice = parsePrice(
          text([
            '[class*="ProductCard_ourPrice"]',
            '[class*="ourPrice"]',
          ])
        );

        const mrp = parsePrice(
          text([
            '[class*="ProductCard_originalMrp"]',
            '[class*="ProductCard_striked"]',
            '[class*="strikedPrice"]',
          ])
        );

        const discountRaw = text([
          '[class*="ProductCard_gcdDiscountPercent"]',
          '[class*="ProductCard_discountPercent"]',
          '[class*="discountPercent"]',
        ]);
        const discountPercent = discountRaw
          ? parseInt(discountRaw.replace(/[^0-9]/g, "")) || undefined
          : undefined;

        const link =
          (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? "";

        return {
          productName: name,
          brandName: brand,
          saltComposition: salt,
          packSize: pack,
          mrp,
          sellingPrice,
          discountPercent:
            discountPercent ??
            (mrp && sellingPrice && mrp > sellingPrice
              ? Math.round(((mrp - sellingPrice) / mrp) * 100)
              : undefined),
          inStock: !card.querySelector('[class*="outOfStock"], [class*="OutOfStock"]'),
          productUrl: link.startsWith("http")
            ? link
            : `https://pharmeasy.in${link}`,
          pharmacyName: "pharmeasy",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
