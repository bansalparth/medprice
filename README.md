# MedPrice

India's most comprehensive medicine price comparator.

Compare prices across **1mg, Netmeds, PharmEasy, Apollo, Truemeds, MrMed** — and India's **10,000+ Jan Aushadhi government generic stores** (the biggest savings source no one else surfaces).

- **Search** by typing, voice (Web Speech API), or by photographing your prescription (Gemini Vision OCR)
- **Live scraping** with Playwright across 6 e-pharmacies
- **Jan Aushadhi salt matching** with nearest-store geolocation
- **Animated dark UI** (Framer Motion + Tailwind, Syne + DM Sans)

---

## Quick start

```bash
# 1. install deps (pulls Playwright Chromium ~150MB)
npm install
npx playwright install chromium

# 2. set up env — defaults to local SQLite, no DB to provision
cp .env.example .env.local
# Then edit .env.local and add your GEMINI_API_KEY (https://aistudio.google.com/app/apikey)

# 3. create the database
npm run db:push

# 4. seed Jan Aushadhi data (downloads PMBJP PDF + geocodes ~20 stores via Nominatim)
npm run seed:ja
npm run seed:stores

# 5. run the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional — pre-warm the cache

```bash
npm run seed:medicines    # scrapes top 20 medicines so first searches are instant
```

### Optional — run the daily cron worker

```bash
npm run worker            # scheduled at 02:00 IST daily
tsx workers/daily-scrape.ts --once   # run a refresh immediately
```

---

## Env vars

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Default `file:./dev.db` (SQLite). Switch to Postgres by changing this URL **and** `provider` in `prisma/schema.prisma`. |
| `GEMINI_API_KEY` | for OCR | Get from https://aistudio.google.com/app/apikey |
| `ADMIN_PASSWORD` | yes | Used to gate `/admin` |
| `NEXT_PUBLIC_APP_URL` | no | Defaults to `http://localhost:3000` |

---

## Architecture

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS, Framer Motion |
| Icons | lucide-react |
| Database | SQLite via Prisma (Postgres-ready) |
| Scraping | Playwright (Chromium, headless) |
| OCR | Gemini 1.5 Flash |
| Voice | Web Speech API (browser-native) |
| Geocoding | OpenStreetMap Nominatim (free) |
| Distance | Haversine in-app |
| Cron | node-cron |

---

## How search works

1. User searches a medicine (text, voice, or photographed prescription)
2. `GET /api/search?q=…`
   - If we have listings cached < 24h → return immediately
   - Otherwise → trigger live `scrapeAll(q)`: 6 scrapers in parallel via `Promise.allSettled`
3. Listings persist; salt-composition is matched to a Jan Aushadhi product (Jaccard token similarity ≥ 0.4)
4. UI surfaces the JA option pinned at the top in green, then sorts paid pharmacies by selling price

A daily cron (`workers/daily-scrape.ts`) re-scrapes everything every 24h.

---

## A note on scrapers

E-pharmacy sites in India are JS-rendered and actively block automated traffic with Cloudflare/Akamai. The 6 scrapers in `lib/scrapers/` use:

- random User-Agent rotation
- `webdriver` flag spoofing
- multi-selector fallbacks (sites change CSS class names every few months)
- graceful degradation: if one site fails, the others still return

Even so, expect occasional zero-results from any single site. The orchestrator returns whatever did succeed. To debug a specific scraper, hit `POST /api/admin/trigger-scrape` with `{"query":"paracetamol","pharmacy":"1mg"}` from the Admin page.

---

## Project layout

```
app/                 # Next.js routes (pages + API)
  api/
    search/          # main search endpoint
    ocr/             # prescription image → medicine names
    stores/          # nearby + state/district lookup
    admin/           # status, manual scrape trigger
    go/              # affiliate redirect + click logging
components/
  home/              # Hero, HowItWorks, JanAushadhiSpotlight, RecentSearches
  search/            # SearchBar, VoiceButton, PrescriptionUploadModal
  results/           # PriceCard, JanAushadhiCard, StoreLocatorPanel, ResultsView
lib/
  scrapers/          # 6 site scrapers + orchestrator + shared browser util
  jan-aushadhi/      # matcher (Jaccard) + geo (Haversine)
  ocr.ts             # Gemini Vision call
  prisma.ts          # singleton client
  utils.ts
workers/
  daily-scrape.ts    # node-cron worker
scripts/
  seed-jan-aushadhi.ts
  seed-stores.ts
  preseed-medicines.ts
prisma/
  schema.prisma
public/
  uploads/           # prescription images (gitignored)
```

---

## License & disclaimer

Open data. **Prices change frequently — always confirm with the pharmacy before buying.** This project is not affiliated with any of the listed pharmacies or with PMBJP.
