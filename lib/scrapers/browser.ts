import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

/**
 * tsx/esbuild emits __name(fn, "name") wrappers inside compiled functions.
 * When Playwright serializes the evaluate callback, those wrappers travel into
 * the browser, where __name is undefined. This helper prepends a __name shim
 * to the serialized function body so evaluate works.
 */
export async function safeEvaluate<T>(
  page: Page,
  fn: () => T | Promise<T>
): Promise<T> {
  const src = `(() => { var __name = (f) => f; return (${fn.toString()})(); })()`;
  return page.evaluate(src) as Promise<T>;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

export interface PageHandle {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

// Shared browser singleton — launching Chromium 6× per search was the dominant
// cost. We reuse one browser process and create ephemeral contexts per scrape.
let _sharedBrowser: Promise<Browser> | null = null;
function getSharedBrowser(): Promise<Browser> {
  if (!_sharedBrowser) {
    _sharedBrowser = chromium
      .launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
        ],
      })
      .catch((err) => {
        _sharedBrowser = null;
        throw err;
      });
  }
  return _sharedBrowser;
}

export interface NewPageOptions {
  /** Cookies to seed before navigation — used to inject a per-pharmacy pincode. */
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
  }>;
  /** localStorage entries to seed (origin → key/value pairs). */
  localStorage?: { origin: string; entries: Record<string, string> };
}

export async function newPage(opts: NewPageOptions = {}): Promise<PageHandle> {
  const browser = await getSharedBrowser();

  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1366, height: 800 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: {
      "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
    },
  });

  // Pincode injection: cookies before any navigation.
  if (opts.cookies && opts.cookies.length > 0) {
    try {
      await context.addCookies(
        opts.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path ?? "/",
        }))
      );
    } catch (err) {
      // Bad cookie shouldn't kill the scrape — just continue without it.
      console.warn("[browser] failed to seed cookies:", err);
    }
  }

  if (opts.localStorage) {
    const { origin, entries } = opts.localStorage;
    await context.addInitScript(
      ({ origin: o, entries: e }) => {
        try {
          if (window.location.origin === o) {
            for (const [k, v] of Object.entries(e as Record<string, string>)) {
              localStorage.setItem(k, v);
            }
          }
        } catch {}
      },
      { origin, entries }
    );
  }

  // Lightweight stealth — hide webdriver flag
  // Also shim esbuild's __name helper so page.evaluate works under tsx
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    // @ts-ignore
    if (typeof (globalThis as any).__name === "undefined") {
      // @ts-ignore
      (globalThis as any).__name = (fn: any) => fn;
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);

  // Block heavy assets we don't need
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      return route.abort();
    }
    return route.continue();
  });

  return {
    browser,
    context,
    page,
    close: async () => {
      // Only close the context — keep the shared browser alive for the next scrape.
      try {
        await context.close();
      } catch {}
    },
  };
}

export function jitter(min = 800, max = 1800): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

export function parsePrice(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? undefined : n;
}
