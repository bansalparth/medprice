// Shared HTTP fetch helper for the fast-path scrapers.
//
// Pharmacy PWAs all serve their search results from JSON APIs or embedded
// page state. Hitting those directly with `fetch` is 10-50x faster than
// launching a headless browser and works on Vercel's free tier with no
// chromium binary.

const DEFAULT_TIMEOUT_MS = 8000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: "GET" | "POST";
  body?: string;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "user-agent": UA,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        ...(opts.headers ?? {}),
      },
      body: opts.body,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchOpts = {}
): Promise<T> {
  const text = await fetchText(url, {
    ...opts,
    headers: { accept: "application/json", ...(opts.headers ?? {}) },
  });
  return JSON.parse(text) as T;
}

export function parsePrice(s: unknown): number | undefined {
  if (s == null) return undefined;
  const str = String(s);
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? undefined : n;
}

// Extract an embedded JSON blob assigned to a global, e.g.
// `window.__INITIAL_STATE__={...};</script>`.
// Walks character-by-character with brace counting so it survives nested
// objects, escaped quotes, and trailing script content.
export function extractJsonAssignment(html: string, marker: string): string | null {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = i + marker.length;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"' && !esc) {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, j + 1);
    }
  }
  return null;
}
