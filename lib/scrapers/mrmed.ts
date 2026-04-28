import { newPage, jitter, safeEvaluate } from "./browser";
import type { ScrapedListing } from "./types";

/**
 * MrMed search:
 *   - URL: /search?searchText={q}
 *   - Tailwind-based markup, no semantic class names. We anchor extraction
 *     on:
 *       - <h3> for product name
 *       - <h4> for selling price (e.g. "₹52")
 *       - sibling <s>/<del> for original MRP (e.g. "(₹64.88)")
 *       - <a href="/medicines/...">/<a href="/otc/..."> for the product URL
 *       - "{N}% Off" text for discount
 *       - Out-of-stock state: text "Notify Me" / "Out of Stock" replaces
 *         "Add to cart"
 */
export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const handle = await newPage({
    cookies: pincode
      ? [{ name: "pincode", value: pincode, domain: ".mrmed.in" }]
      : undefined,
  });
  try {
    const url = `https://www.mrmed.in/search?searchText=${encodeURIComponent(
      query
    )}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(1500, 2500);

    // Wait for product result h3 headings to render
    await handle.page
      .waitForFunction(
        () => {
          const h3s = Array.from(document.querySelectorAll("h3"));
          return h3s.some((h) => {
            const t = h.textContent?.trim() ?? "";
            return (
              t.length > 3 &&
              !/Search Results|MrMed|Why|Footer|Download|Excellence/i.test(t)
            );
          });
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

      // For each product h3 find the smallest ancestor that:
      //   (a) contains the h3
      //   (b) contains an h4 (selling price)
      //   (c) contains a /medicines/ or /otc/ anchor
      //   (d) does NOT contain another product h3 — so we get one card, not
      //       the whole results column
      const productH3s = Array.from(document.querySelectorAll("h3")).filter(
        (h) => {
          const txt = h.textContent?.trim() ?? "";
          return (
            txt.length > 3 &&
            !/Search Results|MrMed|Why|Footer|Download|Excellence|Customer/i.test(
              txt
            )
          );
        }
      );

      const findCard = (h3: Element): HTMLElement | null => {
        let p: HTMLElement | null = h3.parentElement;
        while (p && p.tagName !== "BODY") {
          const h4 = p.querySelector("h4");
          const link = p.querySelector(
            'a[href^="/medicines/"], a[href^="/otc/"]'
          );
          const otherH3 = Array.from(p.querySelectorAll("h3")).filter(
            (x) => x !== h3
          );
          if (h4 && link && otherH3.length === 0) return p;
          p = p.parentElement;
        }
        return null;
      };

      const seen = new Set<HTMLElement>();
      const cards: HTMLElement[] = [];
      for (const h of productH3s) {
        const root = findCard(h);
        if (root && !seen.has(root)) {
          seen.add(root);
          cards.push(root);
        }
      }

      return cards.slice(0, 6).map((card) => {
        const name = card.querySelector("h3")?.textContent?.trim() ?? "";

        const sellingPrice = parsePrice(
          card.querySelector("h4")?.textContent?.trim()
        );

        const mrp = parsePrice(
          card
            .querySelector(
              's, del, [class*="line-through"], [class*="strike"]'
            )
            ?.textContent?.trim() ?? undefined
        );

        const cardText = card.textContent ?? "";
        const offMatch = cardText.match(/(\d+)\s*%\s*Off/i);
        const discountPercent = offMatch ? parseInt(offMatch[1]) : undefined;

        const link =
          (card.querySelector(
            'a[href^="/medicines/"], a[href^="/otc/"]'
          ) as HTMLAnchorElement | null)?.getAttribute("href") ?? "";

        const salt = card
          .querySelector('a[href*="/molecule/"]')
          ?.textContent?.trim();

        const lower = cardText.toLowerCase();
        const inStock = !/out of stock|notify me|sold out|currently unavailable/i.test(
          lower
        );

        return {
          productName: name,
          saltComposition: salt,
          mrp,
          sellingPrice,
          discountPercent,
          inStock,
          productUrl: link.startsWith("http")
            ? link
            : `https://www.mrmed.in${link}`,
          pharmacyName: "mrmed",
        };
      });
    });

    return results.filter((r) => r.productName);
  } finally {
    await handle.close();
  }
}
