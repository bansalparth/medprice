import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

/**
 * Truemeds search:
 *   - URL is path-based: /search/{query} (NOT ?searchQuery=...)
 *   - Markup uses styled-components (hashed class names), so we anchor
 *     extraction on stable structural cues:
 *       - product image with alt = "{Product Name}"
 *       - sibling spans for manufacturer / pack / "₹{price}" / "MRP ₹{mrp}" /
 *         "{N}% OFF"
 *       - "Out of Stock" or "Add To Cart" buttons indicate stock
 *   - No anchor-tag link to the PDP from the search card; we synthesise the
 *     URL by URL-encoding the product name (truemeds is forgiving here).
 */
export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
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
    const url = `https://www.truemeds.in/search/${encodeURIComponent(query)}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1500, 2500);

    // Wait for at least one product image whose alt looks like a medicine
    await handle.page
      .waitForFunction(
        () => {
          const imgs = Array.from(document.querySelectorAll("img[alt]"));
          return imgs.some((i) =>
            /Tablet|Capsule|Injection|Syrup|Drops|Cream|Ointment|Powder|Sachet/i.test(
              (i as HTMLImageElement).alt
            )
          );
        },
        undefined,
        { timeout: 12000 }
      )
      .catch(() => {});

    const results = await safeEvaluate(handle.page, () => {
      const parsePrice = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const n = parseFloat(s.replace(/[^0-9.]/g, ""));
        return isNaN(n) || n <= 0 ? undefined : n;
      };

      // Anchor on product images (alt text identifies the SKU)
      const productImgs = Array.from(
        document.querySelectorAll("img[alt]")
      ).filter((i) =>
        /Tablet|Capsule|Injection|Syrup|Drops|Cream|Ointment|Powder|Sachet/i.test(
          (i as HTMLImageElement).alt
        )
      ) as HTMLImageElement[];

      // For each image walk up until we find a parent that contains MRP + an
      // Add To Cart / Out of Stock label, AND no other product image (so it's
      // a single card, not the whole results container).
      const findCard = (img: HTMLImageElement): HTMLElement | null => {
        let p: HTMLElement | null = img.parentElement;
        while (p && p.tagName !== "BODY") {
          const t = p.textContent ?? "";
          if (t.includes("MRP") && /Add To Cart|Out of Stock/i.test(t)) {
            const otherImgs = Array.from(p.querySelectorAll("img[alt]")).filter(
              (i) =>
                i !== img &&
                /Tablet|Capsule|Injection|Syrup|Drops|Cream|Ointment|Powder|Sachet/i.test(
                  (i as HTMLImageElement).alt
                )
            );
            if (otherImgs.length === 0) return p;
          }
          p = p.parentElement;
        }
        return null;
      };

      const seen = new Set<HTMLElement>();
      const cards: { img: HTMLImageElement; root: HTMLElement }[] = [];
      for (const img of productImgs.slice(0, 12)) {
        const root = findCard(img);
        if (root && !seen.has(root)) {
          seen.add(root);
          cards.push({ img, root });
        }
      }

      return cards.slice(0, 6).map(({ img, root }) => {
        const name = img.alt.trim();

        const spans = Array.from(root.querySelectorAll("span"))
          .map((s) => s.textContent?.trim() ?? "")
          .filter(Boolean);

        // Manufacturer is usually the first non-numeric, non-pack span
        const manufacturer = spans.find(
          (s) =>
            !/^₹|^MRP|^Strip of|^Bottle|^Box of|^Pack|^\d+\s*%/.test(s) &&
            s.length > 5 &&
            s.length < 80
        );

        const packSize = spans.find((s) =>
          /^Strip of|^Bottle|^Box of|^Pack|^Sachet|^Vial|^Tube|^Tin|^Jar|of\s+\d+\s+Units/i.test(
            s
          )
        );

        // Selling price: span starting with ₹ but not "MRP"
        const sellingPriceSpan = spans.find(
          (s) => s.startsWith("₹") && !/MRP/i.test(s)
        );
        const sellingPrice = parsePrice(sellingPriceSpan);

        // MRP: span containing "MRP"
        const mrpSpan = spans.find((s) => /MRP/i.test(s));
        const mrp = parsePrice(mrpSpan);

        // Discount: span containing "% OFF"
        const offSpan = spans.find((s) => /%\s*OFF/i.test(s));
        const discountPercent = offSpan
          ? parseInt(offSpan.replace(/[^0-9]/g, "")) || undefined
          : undefined;

        const cardText = (root.textContent ?? "").toLowerCase();
        const inStock = !/out of stock|notify me|sold out|currently unavailable/i.test(
          cardText
        );

        const slug = name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");

        return {
          productName: name,
          packSize,
          mrp,
          sellingPrice,
          discountPercent,
          inStock,
          productUrl: `https://www.truemeds.in/medicine/${slug}`,
          pharmacyName: "truemeds",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
