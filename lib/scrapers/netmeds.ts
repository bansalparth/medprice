import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // Netmeds: pincode lives in `n_pincode` cookie used by the delivery widget
  // and stock checks.
  const handle = await newPage({
    cookies: pincode
      ? [{ name: "n_pincode", value: pincode, domain: ".netmeds.com" }]
      : undefined,
  });
  try {
    const url = `https://www.netmeds.com/products?q=${encodeURIComponent(query)}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1500, 2500);

    await handle.page
      .waitForSelector(".card-desc, .product-desc", { timeout: 12000 })
      .catch(() => {});

    await handle.page.evaluate(() => window.scrollTo(0, 600));
    await jitter(800, 1200);

    const results = await safeEvaluate(handle.page, () => {
      const parsePrice = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const n = parseFloat(s.replace(/[^0-9.]/g, ""));
        return isNaN(n) || n <= 0 ? undefined : n;
      };

      const cards = Array.from(
        document.querySelectorAll(".card-desc, .product-desc")
      );

      // Dedup by link href since both classes may overlap on same card
      const seen = new Set<string>();
      const unique = cards.filter((c) => {
        const link = (c.querySelector("a") as HTMLAnchorElement | null)?.href ?? "";
        if (!link || seen.has(link)) return false;
        seen.add(link);
        return true;
      });

      return unique.slice(0, 6).map((card) => {
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
            "h3",
            ".head-lineheight-set",
            "[class*='product-name']",
          ]) ?? "";

        const pack = text([
          ".jm-body-xxxs-bold",
          "[class*='pack-size']",
        ]);

        const brand = text([".manufacturer-title"]);

        const sellingPrice = parsePrice(
          text([
            ".priceDisplay",
            ".effective-price",
            ".cl-Profict-inactive",
            ".cl-Profit",
            ".price",
          ])
        );

        const mrp = parsePrice(
          text([".strike-through", "[class*='strike']", "del"])
        );

        const discountRaw = text([".web-discount", "[class*='discount']"]);
        const discountPercent = discountRaw
          ? parseInt(discountRaw.replace(/[^0-9]/g, "")) || undefined
          : undefined;

        const link =
          (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? "";

        const outOfStock = !!card.querySelector(".oos");

        return {
          productName: name,
          brandName: brand,
          packSize: pack,
          mrp,
          sellingPrice,
          discountPercent:
            discountPercent ??
            (mrp && sellingPrice && mrp > sellingPrice
              ? Math.round(((mrp - sellingPrice) / mrp) * 100)
              : undefined),
          inStock: !outOfStock,
          productUrl: link.startsWith("http")
            ? link
            : `https://www.netmeds.com${link}`,
          pharmacyName: "netmeds",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
