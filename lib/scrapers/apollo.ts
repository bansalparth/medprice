import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // Apollo stores the active pincode in a `pincode` cookie; product cards then
  // mark "Out of Stock" or hide if not deliverable to that pincode.
  const handle = await newPage({
    cookies: pincode
      ? [
          { name: "pincode", value: pincode, domain: ".apollopharmacy.in" },
          { name: "apollo_pincode", value: pincode, domain: ".apollopharmacy.in" },
        ]
      : undefined,
  });
  try {
    const url = `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(
      query
    )}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1500, 2500);

    await handle.page
      .waitForSelector('[class*="ProductCard_productCardGrid"]', {
        timeout: 12000,
      })
      .catch(() => {});

    await handle.page.evaluate(() => window.scrollTo(0, 600));
    await jitter(800, 1200);

    const results = await safeEvaluate(handle.page, () => {
      const parsePrice = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const cleaned = s.replace(/MRP/gi, "").replace(/[^0-9.]/g, "");
        const n = parseFloat(cleaned);
        return isNaN(n) || n <= 0 ? undefined : n;
      };

      const cards = Array.from(
        document.querySelectorAll('[class*="ProductCard_productCardGrid"]')
      );

      return cards.slice(0, 12).map((card) => {
        // Apollo uses minified single-letter class names that change on every build,
        // so we extract using text patterns + DOM structure rather than CSS classes.

        const allText = (card.textContent ?? "").replace(/\s+/g, " ").trim();

        // Name: first <h2> in the card
        const h2s = card.querySelectorAll("h2");
        const name = h2s[0]?.textContent?.trim() ?? "";
        const pack = h2s[1]?.textContent?.trim() ?? "";

        // Salt composition: look for a leaf div whose text is ONLY salt + dosage
        // (no "Tablet", no rupee, no category words, short).
        let salt: string | undefined;
        const allDivs = Array.from(card.querySelectorAll("div"));
        const SALT_SHAPE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*[\s\-]\d+\s?(?:mg|mcg|ml|g)i?$/i;
        for (const d of allDivs) {
          // Only consider leaf-ish divs (no nested divs of their own)
          if (d.querySelector("div")) continue;
          const t = d.textContent?.trim() ?? "";
          if (!t || t.length > 60) continue;
          if (/tablet|capsule|syrup|injection|drop|fever|pain|relief/i.test(t)) continue;
          if (/₹|MRP|off|coupon/i.test(t)) continue;
          if (SALT_SHAPE.test(t)) {
            salt = t;
            break;
          }
        }

        // Prices: find specific elements (not concatenated text), since
        // adjacent siblings like "₹21" + "20%" would otherwise glue into "2120".
        let sellingPrice: number | undefined;
        let mrp: number | undefined;
        let discountPercent: number | undefined;

        for (const el of Array.from(card.querySelectorAll("p, span, div"))) {
          const t = (el.textContent ?? "").trim();
          if (!t || t.length > 40) continue;
          // MRP element: text like "MRP ₹21" or "MRP ₹212.00"
          if (!mrp) {
            const m = t.match(/^MRP\s*₹\s?([\d,]+(?:\.\d+)?)\s*$/i);
            if (m) mrp = parsePrice(m[1]);
          }
          // Discount element: text like "20% off" exactly
          if (!discountPercent) {
            const d = t.match(/^(\d+)\s*%\s*off\s*$/i);
            if (d) discountPercent = parseInt(d[1]);
          }
          // Selling price: standalone "₹X" without "MRP" prefix
          if (!sellingPrice) {
            const s = t.match(/^₹\s?([\d,]+(?:\.\d+)?)\s*$/);
            if (s) sellingPrice = parsePrice(s[1]);
          }
        }

        // Fallback if structured extraction missed: scan all rupee values
        if (!sellingPrice) {
          const matches = allText.match(/₹\s?[\d,]+(?:\.\d+)?/g) ?? [];
          if (matches.length > 0) sellingPrice = parsePrice(matches[0]);
        }

        // If only one price shown (no discount), MRP = selling
        if (sellingPrice && !mrp) mrp = sellingPrice;

        if (!discountPercent && mrp && sellingPrice && mrp > sellingPrice) {
          discountPercent = Math.round(((mrp - sellingPrice) / mrp) * 100);
        }

        // Apollo's product cards sometimes contain secondary "Shop similar"
        // anchors that point to a different SKU than the H2 product. Prefer
        // the anchor that wraps the H2 (the canonical product link).
        const h2El = h2s[0] as HTMLElement | undefined;
        const wrappingAnchor = h2El?.closest("a") as HTMLAnchorElement | null;
        const link =
          wrappingAnchor?.href ??
          (card.querySelector("a") as HTMLAnchorElement | null)?.href ??
          "";

        const outOfStock =
          /out\s*of\s*stock|not\s+available\s+for\s+online\s+sale|currently\s+unavailable|not\s+serviceable|discontinued|sold\s+out/i.test(allText) ||
          /notify\s*me/i.test(allText);

        return {
          productName: name,
          packSize: pack || undefined,
          saltComposition: salt,
          mrp,
          sellingPrice,
          discountPercent,
          inStock: !outOfStock,
          productUrl: link.startsWith("http")
            ? link
            : `https://www.apollopharmacy.in${link}`,
          pharmacyName: "apollo",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
