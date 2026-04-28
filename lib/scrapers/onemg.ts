import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // 1mg keeps the active pincode in a `pincode` cookie; setting it before
  // navigation makes search and product cards reflect that locality.
  const handle = await newPage({
    cookies: pincode
      ? [{ name: "pincode", value: pincode, domain: ".1mg.com" }]
      : undefined,
  });
  try {
    const url = `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1500, 2500);

    await handle.page
      .waitForSelector('[class*="SearchResultContainer__cardContainer"]', {
        timeout: 12000,
      })
      .catch(() => {});

    // Scroll to trigger lazy-load
    await handle.page.evaluate(() => window.scrollTo(0, 600));
    await jitter(800, 1200);

    const results = await safeEvaluate(handle.page, () => {
      const parsePrice = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const n = parseFloat(s.replace(/[^0-9.]/g, ""));
        return isNaN(n) || n <= 0 ? undefined : n;
      };

      const cards = Array.from(
        document.querySelectorAll('[class*="SearchResultContainer__cardContainer"]')
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

        // Name lives in the dedicated tile container
        const name =
          text([
            '[class*="VerticalProductTile__productName"]',
            '[class*="VerticalProductTile__product"] .smallSemiBold',
            '.smallSemiBold.textPrimary',
            "h3",
          ]) ?? "";

        // Pack size — small grey text under name
        const pack = text(['[class*="VerticalProductTile__packSize"]', '.xSmallRegular']);

        const sellingPriceRaw = text(['span.l5Medium', '[class*="textPrimary"][class*="l5Medium"]']);
        // The text may include "Discounted Price:" prefix from a visuallyHidden span
        const sellingPrice = parsePrice(sellingPriceRaw);

        const mrpRaw = text(['strike', '[class*="Price__marginLeft"]']);
        const mrp = parsePrice(mrpRaw);

        const discountRaw = text(['[class*="successColor"]']);
        const discountPercent = discountRaw
          ? parseInt(discountRaw.replace(/[^0-9]/g, "")) || undefined
          : undefined;

        const link = (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? "";

        // Detect "not buyable" states. 1mg shows these in several ways:
        //   1. Text content: "OUT OF STOCK", "Sold Out", "Notify Me", etc.
        //   2. Image badges: a discontinued/not-for-sale tag rendered as an
        //      <img> with alt="Discontinued" and src ending in
        //      "not_for_sale_tag.svg" (textContent does NOT include alt text).
        //   3. Class names containing OutOfStock / NotForSale / Discontinued.
        const cardText = (card.textContent ?? "").toLowerCase();
        const UNAVAILABLE_PATTERNS = [
          "out of stock",
          "discontinued",
          "not for online sale",
          "not available for online sale",
          "currently unavailable",
          "sold out",
          "notify me",
        ];
        const hasUnavailableText = UNAVAILABLE_PATTERNS.some((p) =>
          cardText.includes(p)
        );

        // Scan img alts and srcs — 1mg's discontinued/not-for-sale badge is an SVG.
        const imgs = Array.from(card.querySelectorAll("img"));
        const hasUnavailableImage = imgs.some((img) => {
          const alt = (img.getAttribute("alt") ?? "").toLowerCase();
          const src = (img.getAttribute("src") ?? "").toLowerCase();
          if (UNAVAILABLE_PATTERNS.some((p) => alt.includes(p))) return true;
          if (
            src.includes("not_for_sale") ||
            src.includes("notforsale") ||
            src.includes("out_of_stock") ||
            src.includes("outofstock") ||
            src.includes("discontinued") ||
            src.includes("sold_out") ||
            src.includes("soldout")
          ) {
            return true;
          }
          return false;
        });

        const hasOutOfStockClass = !!card.querySelector(
          '[class*="OutOfStock"], [class*="out-of-stock"], [class*="NotForSale"], [class*="Discontinued"]'
        );

        // No price = not buyable. 1mg almost always shows a price for buyable
        // products; missing price strongly correlates with discontinued/blocked.
        const hasPrice = sellingPrice != null || mrp != null;

        const inStock =
          hasPrice && !hasOutOfStockClass && !hasUnavailableText && !hasUnavailableImage;

        return {
          productName: name,
          packSize: pack,
          mrp,
          sellingPrice,
          discountPercent:
            discountPercent ??
            (mrp && sellingPrice && mrp > sellingPrice
              ? Math.round(((mrp - sellingPrice) / mrp) * 100)
              : undefined),
          inStock,
          productUrl: link.startsWith("http") ? link : `https://www.1mg.com${link}`,
          pharmacyName: "1mg",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
