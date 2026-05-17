import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeAll, scrapeAllStream, type ScrapedListing } from "@/lib/scrapers";
import { findJanAushadhiMatch } from "@/lib/jan-aushadhi/matcher";
import { normalizeMedicineName } from "@/lib/utils";
import { extractPackCount } from "@/lib/pack-size";
import { estimateDelivery } from "@/lib/delivery";
import { lookupDrugDetail } from "@/lib/drug-details";
import { checkAll as checkServiceability } from "@/lib/scrapers/serviceability";
import { readSid } from "@/lib/tracking";
import {
  buildFilterContext,
  filterRelevantListings,
  pickBestPerPharmacy,
} from "@/lib/search/filter";

const REFINE_WINDOW_MS = 30_000;

async function recordSearch(opts: {
  sid: string | null;
  query: string;
  medicineId: string | null;
  inputMethod: string;
  pincode: string | null;
  autocompletePicked: boolean;
}): Promise<string | null> {
  const refinedFromId = opts.sid
    ? await prisma.searchLog
        .findFirst({
          where: {
            sid: opts.sid,
            createdAt: { gte: new Date(Date.now() - REFINE_WINDOW_MS) },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
        .catch(() => null)
    : null;

  return prisma.searchLog
    .create({
      data: {
        query: opts.query,
        medicineId: opts.medicineId,
        inputMethod: opts.inputMethod,
        sid: opts.sid ?? null,
        pincode: opts.pincode ?? null,
        autocompletePicked: opts.autocompletePicked,
        refinedFromId: refinedFromId?.id ?? null,
      },
      select: { id: true },
    })
    .then((r) => r.id)
    .catch(() => null);
}

function finalizeSearchLog(
  searchLogId: string | null,
  listings: { pharmacyName: string; sellingPrice: number | null; mrp: number | null; productName?: string }[],
  janAushadhiMatch: boolean,
  latencyMs: number,
  medicineId: string | null
) {
  if (!searchLogId) return;
  prisma.searchLog
    .update({
      where: { id: searchLogId },
      data: {
        resultsCount: listings.length,
        janAushadhiMatch,
        latencyMs,
      },
    })
    .catch(() => null);

  if (listings.length === 0 || !medicineId) return;
  prisma.searchImpression
    .createMany({
      data: listings.map((l, idx) => ({
        searchLogId,
        medicineId,
        pharmacyName: l.pharmacyName,
        position: idx + 1,
        sellingPrice: l.sellingPrice,
        mrp: l.mrp,
        isJanAushadhi: false,
      })),
    })
    .catch(() => null);
}

function refreshSession(sid: string | null, pincode: string | null) {
  if (!sid) return;
  prisma.session
    .upsert({
      where: { sid },
      update: {
        lastSeenAt: new Date(),
        pincode: pincode ?? undefined,
      },
      create: {
        sid,
        pincode: pincode ?? null,
        locationSource: pincode ? "search" : null,
      },
    })
    .catch(() => null);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Three-tier cache (instant response for everything we've seen before):
//   - FRESH (< FRESH_TTL_MS):     serve immediately, no scrape.
//   - STALE (FRESH..STALE_TTL_MS): serve immediately, kick off background refresh.
//   - ANCIENT (> STALE_TTL_MS):    STILL serve immediately + background refresh.
//     We only block on a live scrape when there's literally nothing cached.
const FRESH_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Beyond STALE_TTL_MS we still return the cached row (now treated as a
// best-effort placeholder) and queue a background refresh — never block the
// user on a slow scrape just because the data is old.
const ANCIENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Short-TTL in-memory dedupe so two near-simultaneous requests for the same
// medicine reuse the same in-flight scrape instead of launching it twice.
const inflight = new Map<string, Promise<ScrapedListing[]>>();
const INFLIGHT_TTL_MS = 30_000;

/**
 * Search returns one specific medicine's prices across pharmacies.
 *
 * Two ways to call:
 *  - ?medicineId=xxx     (preferred — exact catalog match)
 *  - ?q=text             (legacy free-text — still supported for back-compat)
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const medicineIdParam = req.nextUrl.searchParams.get("medicineId")?.trim();
  const queryParam = req.nextUrl.searchParams.get("q")?.trim();
  const inputMethod = req.nextUrl.searchParams.get("method") ?? "text";
  const pincode = req.nextUrl.searchParams.get("pincode") ?? null;
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const autocompletePicked = req.nextUrl.searchParams.get("picked") === "1";
  const requestedPackParam = req.nextUrl.searchParams.get("packSize");
  const requestedPack = requestedPackParam
    ? parseInt(requestedPackParam, 10) || null
    : null;
  const sid = readSid(req);
  refreshSession(sid, pincode);

  if (!medicineIdParam && !queryParam) {
    return NextResponse.json(
      { error: "Provide either medicineId or q" },
      { status: 400 }
    );
  }

  // Resolve to a Medicine row
  let medRow = medicineIdParam
    ? await prisma.medicine.findUnique({
        where: { id: medicineIdParam },
      })
    : null;

  if (!medRow && queryParam) {
    medRow = await prisma.medicine.findFirst({
      where: { normalizedName: normalizeMedicineName(queryParam) },
    });
  }

  // Fallback: if free-text and no catalog match, create a transient row
  if (!medRow && queryParam) {
    medRow = await prisma.medicine.upsert({
      where: { normalizedName: normalizeMedicineName(queryParam) },
      update: {},
      create: {
        name: queryParam,
        normalizedName: normalizeMedicineName(queryParam),
        isCatalog: false,
      },
    });
  }

  if (!medRow) {
    return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
  }

  const searchLogId = await recordSearch({
    sid,
    query: queryParam ?? medRow.name,
    medicineId: medRow.id,
    inputMethod,
    pincode,
    autocompletePicked,
  });

  // Build the precise scrape query — for catalog entries we use the FULL display
  // name (e.g., "Crocin Advance Tablet" → matches that brand only)
  const scrapeQuery = medRow.brandName
    ? `${medRow.brandName} ${medRow.dosageForm ?? ""}`.trim()
    : medRow.name;

  // Check cached listings — pincode-aware so different cities don't collide.
  // When a pincode is supplied, ONLY serve pincode-specific listings (not the
  // national/null ones).  National listings may have stale prices (e.g. 1mg
  // prices differ between Delhi and Mumbai) and would suppress a fresh scrape.
  const cachedMed = await prisma.medicine.findUnique({
    where: { id: medRow.id },
    include: {
      listings: {
        // Accept anything up to ANCIENT_TTL_MS old — we'd rather show stale
        // prices instantly than make the user wait on a slow scrape.
        where: {
          scrapedAt: { gte: new Date(Date.now() - ANCIENT_TTL_MS) },
          pincode: pincode ?? null,
        },
        orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }],
      },
      saltMappings: { include: { janAushadhiProduct: true } },
    },
  });

  // Manual refresh: drop ALL cached listings for this medicine so the live
  // scrape is not diluted with stale rows from any pincode scope.
  if (refresh) {
    await prisma.pharmacyListing.deleteMany({
      where: {
        medicineId: medRow.id,
      },
    });
  }

  if (!refresh && cachedMed && cachedMed.listings.length > 0) {
    const newest = cachedMed.listings.reduce(
      (max: number, l: any) =>
        Math.max(max, new Date(l.scrapedAt).getTime()),
      0
    );
    const ageMs = Date.now() - newest;

    if (ageMs < FRESH_TTL_MS) {
      const enriched = enrich(cachedMed, pincode, requestedPack);
      finalizeSearchLog(
        searchLogId,
        enriched.listings,
        (enriched.saltMappings?.length ?? 0) > 0,
        Date.now() - t0,
        medRow.id
      );
      return NextResponse.json({
        medicine: enriched,
        cached: true,
        pincode,
        searchLogId,
      });
    }

    // STALE or ANCIENT band: serve immediately, kick off a background refresh.
    // We don't await — Vercel keeps the function alive briefly after the
    // response is sent (best-effort), and even if it's killed mid-scrape
    // the next request still gets a fresh result on its turn.
    const scrapeKey = `${scrapeQuery}::${pincode ?? ""}`;
    if (!inflight.has(scrapeKey)) {
      const p = scrapeAll(scrapeQuery, pincode);
      inflight.set(scrapeKey, p);
      setTimeout(() => inflight.delete(scrapeKey), INFLIGHT_TTL_MS);
      void p
        .then((scraped) =>
          persistScrapeResults(medRow!, scraped, pincode, requestedPack)
        )
        .catch((e) =>
          console.error("[search] background refresh failed:", e?.message)
        );
    }

    const enrichedStale = enrich(cachedMed, pincode, requestedPack);
    finalizeSearchLog(
      searchLogId,
      enrichedStale.listings,
      (enrichedStale.saltMappings?.length ?? 0) > 0,
      Date.now() - t0,
      medRow.id
    );
    return NextResponse.json({
      medicine: enrichedStale,
      cached: true,
      stale: true,
      ageMs,
      pincode,
      searchLogId,
    });
  }

  // Cache miss → stream results to the client. Each pharmacy chunk is
  // written the moment its scrape resolves; DB writes happen AFTER the
  // final listing is sent so the user sees results in ~1s instead of
  // waiting for the slowest pharmacy + DB writes (formerly 10–17s).
  //
  // Back-compat: if the caller doesn't accept NDJSON (e.g. tests, crawlers),
  // fall through to the legacy blocking JSON path.
  const acceptsStream = (req.headers.get("accept") ?? "").includes(
    "application/x-ndjson"
  );

  if (acceptsStream) {
    return buildStreamingResponse(medRow, scrapeQuery, pincode, searchLogId, t0, requestedPack);
  }

  // Legacy non-streaming path (unchanged).
  const scrapeKey = `${scrapeQuery}::${pincode ?? ""}`;
  let scrapePromise = inflight.get(scrapeKey);
  if (!scrapePromise) {
    scrapePromise = scrapeAll(scrapeQuery, pincode);
    inflight.set(scrapeKey, scrapePromise);
    setTimeout(() => inflight.delete(scrapeKey), INFLIGHT_TTL_MS);
  }
  const scraped = await scrapePromise;

  if (scraped.length === 0) {
    const fullMedEmpty = await prisma.medicine.findUnique({
      where: { id: medRow.id },
      include: {
        listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
        saltMappings: { include: { janAushadhiProduct: true } },
      },
    });
    const enrichedEmpty = enrich(fullMedEmpty, pincode, requestedPack);
    finalizeSearchLog(
      searchLogId,
      enrichedEmpty.listings,
      (enrichedEmpty.saltMappings?.length ?? 0) > 0,
      Date.now() - t0,
      medRow.id
    );
    return NextResponse.json({
      medicine: enrichedEmpty,
      cached: false,
      scraped: [],
      pincode,
      searchLogId,
    });
  }

  const { relevantCount } = await persistScrapeResults(medRow, scraped, pincode, requestedPack);

  if (relevantCount === 0) {
    const fullMedEmpty = await prisma.medicine.findUnique({
      where: { id: medRow.id },
      include: {
        listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
        saltMappings: { include: { janAushadhiProduct: true } },
      },
    });
    const enrichedZero = enrich(fullMedEmpty, pincode, requestedPack);
    finalizeSearchLog(
      searchLogId,
      enrichedZero.listings,
      (enrichedZero.saltMappings?.length ?? 0) > 0,
      Date.now() - t0,
      medRow.id
    );
    return NextResponse.json({
      medicine: enrichedZero,
      cached: false,
      scraped: [],
      pincode,
      searchLogId,
      message: `No live listings matched the brand "${medRow.brandName ?? medRow.name}". The drug may be out of stock everywhere or our scrapers are being blocked.`,
    });
  }

  const fullMed = await prisma.medicine.findUnique({
    where: { id: medRow.id },
    include: {
      listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
      saltMappings: { include: { janAushadhiProduct: true } },
    },
  });
  const enrichedFinal = enrich(fullMed, pincode, requestedPack);
  finalizeSearchLog(
    searchLogId,
    enrichedFinal.listings,
    (enrichedFinal.saltMappings?.length ?? 0) > 0,
    Date.now() - t0,
    medRow.id
  );
  return NextResponse.json({
    medicine: enrichedFinal,
    cached: false,
    pincode,
    searchLogId,
  });
}

/**
 * Streaming search response (NDJSON, one JSON object per line).
 *
 * Sequence:
 *   1. {type:"medicine", medicine}       — sent immediately (~50ms)
 *   2. {type:"listing", pharmacy, listings} — one per pharmacy as it resolves
 *   3. {type:"done"}                     — client clears any remaining skeletons
 *   4. (function awaits DB writes invisibly, then closes the stream)
 *
 * Why the DB write sits between "done" and stream-close:
 *   - User already sees all cards by the time "done" is sent.
 *   - Vercel keeps the function alive while the stream is open, so writes
 *     are guaranteed to complete (unlike fire-and-forget after `controller.close()`).
 *   - Zero perceived latency cost.
 */
function buildStreamingResponse(
  medRow: any,
  scrapeQuery: string,
  pincode: string | null,
  searchLogId: string | null,
  t0: number,
  requestedPack: number | null = null
): Response {
  const ctx = buildFilterContext(medRow, requestedPack);
  const isBrowserish =
    typeof globalThis.process === "undefined" ||
    process.env.NODE_ENV !== "production";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const writeMsg = (obj: any) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch (err) {
          // Client disconnected — swallow and let cleanup happen below.
          if (isBrowserish)
            console.warn(
              "[search-stream] enqueue failed:",
              (err as Error).message
            );
        }
      };

      // (1) Medicine row — comes from a separate findUnique because the
      // outer GET already read it; this guarantees we have saltMappings
      // attached for the JA savings card.
      const medWithMappings = await prisma.medicine
        .findUnique({
          where: { id: medRow.id },
          include: {
            // Don't send listings in the medicine chunk — they stream as
            // separate per-pharmacy chunks below.
            saltMappings: { include: { janAushadhiProduct: true } },
          },
        })
        .catch(() => null);

      writeMsg({
        type: "medicine",
        medicine: enrich(
          { ...medWithMappings, listings: [] } as any,
          pincode,
          requestedPack
        ),
        pincode,
        searchLogId,
      });

      // (2) Per-pharmacy streaming. Each pharmacy emits its listing chunk
      // as soon as its scraper resolves — WITHOUT waiting for the live
      // serviceability/ETA call. The live check runs in the background and
      // emits a separate {type:"serviceability"} chunk later that the
      // client merges into the existing card. This means a card lands at
      // ~1s and its real ETA fills in ~0.5–2s later.
      const finalListings: ScrapedListing[] = [];
      const svcByPharmacy = new Map<string, any>();
      const svcPromises: Promise<void>[] = [];

      await scrapeAllStream(scrapeQuery, pincode, async (pharmacyName, raw) => {
        try {
          const filtered = filterRelevantListings(raw, ctx);
          const picked = pickBestPerPharmacy(filtered, ctx);

          if (picked.length === 0) {
            writeMsg({ type: "listing", pharmacy: pharmacyName, listings: [] });
            return;
          }

          // Build the initial client-facing listing using ONLY the data the
          // search-API gave us. No live serviceability merge yet — that
          // arrives as a separate chunk.
          const clientListings = picked.map((l) => {
            const hasPrice = l.sellingPrice != null || l.mrp != null;
            return {
              id: `stream-${l.pharmacyName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              medicineId: medRow.id,
              pharmacyName: l.pharmacyName,
              brandName: l.brandName ?? null,
              productName: l.productName,
              packSize: l.packSize ?? null,
              mrp: l.mrp ?? null,
              sellingPrice: l.sellingPrice ?? null,
              discountPercent: l.discountPercent ?? null,
              inStock: l.inStock && hasPrice,
              productUrl: l.productUrl ?? null,
              // null = live check pending; client renders "checking delivery…"
              deliveryEta: null,
              serviceable: true,
              locationPrice: null,
              pincode: pincode ?? null,
              scrapedAt: new Date().toISOString(),
            };
          });

          finalListings.push(...picked);
          writeMsg({
            type: "listing",
            pharmacy: pharmacyName,
            listings: clientListings,
          });

          // Kick off the live serviceability check WITHOUT awaiting it —
          // emit a follow-up chunk once it resolves. Collect the promise so
          // we can await it before DB persist.
          if (pincode) {
            const listingIdsByPharmacy = clientListings.map((c) => c.id);
            const svcPromise = checkServiceability(picked, pincode)
              .then((svcMap) => {
                if (!svcMap) return;
                clientListings.forEach((cl, idx) => {
                  const svc = svcMap.get(picked[idx].pharmacyName);
                  if (!svc) return;
                  svcByPharmacy.set(picked[idx].pharmacyName, svc);
                  const origPrice = picked[idx].sellingPrice;
                  writeMsg({
                    type: "serviceability",
                    pharmacy: pharmacyName,
                    listingId: listingIdsByPharmacy[idx],
                    inStock: svc.inStock,
                    serviceable: svc.serviceable,
                    // Null when the pharmacy doesn't expose a real ETA —
                    // client shows nothing rather than fabricating a guess.
                    deliveryEta: svc.deliveryEta,
                    sellingPrice: svc.price ?? null,
                    mrp: svc.mrp ?? null,
                    locationPrice:
                      svc.price != null && origPrice != null && svc.price !== origPrice
                        ? svc.price
                        : null,
                  });
                });
              })
              .catch((err: any) => {
                console.warn(
                  `[search-stream] ${pharmacyName} svc failed:`,
                  err?.message ?? err
                );
                // Emit a serviceability chunk with no ETA so the client
                // stops showing "checking delivery…" on this card.
                clientListings.forEach((cl) => {
                  writeMsg({
                    type: "serviceability",
                    pharmacy: pharmacyName,
                    listingId: cl.id,
                    inStock: cl.inStock,
                    serviceable: true,
                    deliveryEta: null,
                    sellingPrice: null,
                    mrp: null,
                    locationPrice: null,
                  });
                });
              });
            svcPromises.push(svcPromise);
          } else {
            // No pincode → no live check is possible. Emit empty
            // serviceability chunk so the client clears the pending state.
            for (const cl of clientListings) {
              writeMsg({
                type: "serviceability",
                pharmacy: pharmacyName,
                listingId: cl.id,
                inStock: cl.inStock,
                serviceable: true,
                deliveryEta: null,
                sellingPrice: null,
                mrp: null,
                locationPrice: null,
              });
            }
          }
        } catch (err: any) {
          console.error(
            `[search-stream] ${pharmacyName} failed:`,
            err?.message ?? err
          );
          writeMsg({ type: "listing", pharmacy: pharmacyName, listings: [] });
        }
      });

      // Wait for all the deferred serviceability calls to finish so:
      //   (a) the "done" chunk doesn't fire while ETAs are still streaming
      //   (b) DB persist below sees the live ETA values
      await Promise.all(svcPromises).catch(() => {});

      writeMsg({ type: "done", count: finalListings.length });

      // (3) DB writes happen after "done" but BEFORE controller.close() so
      // Vercel keeps the function alive. User has already rendered the page.
      try {
        await persistFinalListings(
          medRow,
          finalListings,
          pincode,
          svcByPharmacy
        );
      } catch (err: any) {
        console.error(
          "[search-stream] persistFinalListings failed:",
          err?.message ?? err
        );
      }

      const finalMed = await prisma.medicine
        .findUnique({
          where: { id: medRow.id },
          include: { saltMappings: true },
        })
        .catch(() => null);
      finalizeSearchLog(
        searchLogId,
        finalListings.map((l) => ({
          pharmacyName: l.pharmacyName,
          sellingPrice: l.sellingPrice ?? null,
          mrp: l.mrp ?? null,
        })),
        (finalMed?.saltMappings?.length ?? 0) > 0,
        Date.now() - t0,
        medRow.id
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Disable proxy buffering so chunks reach the browser as written.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * DB persistence for the streaming path. Takes already-filtered listings
 * (no filtering inside) and writes:
 *   - PharmacyListing rows (delete + createMany)
 *   - PriceHistory snapshot per pharmacy
 *   - SaltMapping to Jan Aushadhi
 *   - Medicine row updates (saltComposition, brandName, packSize for non-catalog)
 *
 * All writes that don't depend on each other run in parallel.
 */
async function persistFinalListings(
  medRow: any,
  finalListings: ScrapedListing[],
  pincode: string | null,
  svcByPharmacy: Map<string, any>
): Promise<void> {
  // Empty result set: scrape ran but nothing relevant matched. Flip
  // hasInStock=false so the row stops appearing in autocomplete. Also
  // wipe any stale prior listings (they're not in stock anywhere now).
  if (finalListings.length === 0) {
    await Promise.all([
      prisma.medicine
        .update({ where: { id: medRow.id }, data: { hasInStock: false } })
        .catch(() => null),
      prisma.pharmacyListing
        .deleteMany({ where: { medicineId: medRow.id } })
        .catch(() => null),
    ]);
    return;
  }

  // Derive saltComposition (catalog trusts itself; non-catalog accepts scrape)
  const newSalt =
    finalListings.find((s) => s.saltComposition)?.saltComposition ?? null;
  const saltComposition = medRow.isCatalog
    ? medRow.saltComposition ?? newSalt
    : newSalt ?? medRow.saltComposition;

  // hasInStock drives autocomplete visibility — true if at least one
  // pharmacy listing is buyable (in stock + serviceable + has a price).
  // Mirrors the per-listing `inStock` logic below.
  const hasInStock = finalListings.some((s) => {
    const svc = svcByPharmacy.get(s.pharmacyName);
    const tierEta = estimateDelivery(s.pharmacyName, pincode);
    const serviceable = (svc?.serviceable ?? true) && tierEta.serviceable;
    const hasPrice = s.sellingPrice != null || s.mrp != null;
    return s.inStock && serviceable && hasPrice;
  });

  // Auto-promote / refresh medicine row
  const medUpdate: Promise<any> = medRow.isCatalog
    ? prisma.medicine
        .update({
          where: { id: medRow.id },
          data: {
            hasInStock,
            ...(saltComposition && !medRow.saltComposition
              ? { saltComposition }
              : {}),
          },
        })
        .then(() => null)
        .catch(() => null)
    : prisma.medicine
        .update({
          where: { id: medRow.id },
          data: {
            hasInStock,
            saltComposition: saltComposition ?? undefined,
            brandName:
              medRow.brandName ??
              finalListings[0]?.brandName ??
              medRow.name,
            packSize: medRow.packSize ?? finalListings[0]?.packSize ?? undefined,
          },
        })
        .then(() => null)
        .catch(() => null);

  // Delete old listings + create new ones (must be sequential within this
  // pair, but can run in parallel with medUpdate / priceHistory below).
  const listingWrite = prisma.pharmacyListing
    .deleteMany({ where: { medicineId: medRow.id } })
    .then(() =>
      prisma.pharmacyListing.createMany({
        data: finalListings.map((s) => {
          const svc = svcByPharmacy.get(s.pharmacyName);
          // Store only the REAL ETA the pharmacy advertised. If the live
          // check returned null, store null — never the static guess. The
          // pincode-tier classification still drives `serviceable`.
          const tierEta = estimateDelivery(s.pharmacyName, pincode);
          const eta = {
            eta: svc?.deliveryEta ?? null,
            serviceable: (svc?.serviceable ?? true) && tierEta.serviceable,
          };
          const hasPrice = s.sellingPrice != null || s.mrp != null;
          const locationPrice =
            svc?.price != null && svc.price !== s.sellingPrice
              ? svc.price
              : null;
          return {
            medicineId: medRow.id,
            pharmacyName: s.pharmacyName,
            brandName: s.brandName,
            productName: s.productName,
            packSize: s.packSize,
            mrp: s.mrp,
            sellingPrice: s.sellingPrice,
            discountPercent: s.discountPercent,
            inStock: s.inStock && eta.serviceable && hasPrice,
            productUrl: s.productUrl,
            deliveryEta: eta.eta,
            serviceable: eta.serviceable,
            locationPrice,
            pincode: pincode ?? null,
          };
        }),
      })
    );

  // Price history snapshot
  const cheapestPerPharmacy = new Map<
    string,
    { sellingPrice?: number; mrp?: number }
  >();
  for (const s of finalListings) {
    if (!s.inStock) continue;
    const cur = cheapestPerPharmacy.get(s.pharmacyName);
    const price = s.sellingPrice ?? s.mrp;
    if (price == null) continue;
    if (!cur || (cur.sellingPrice ?? cur.mrp ?? Infinity) > price) {
      cheapestPerPharmacy.set(s.pharmacyName, {
        sellingPrice: s.sellingPrice,
        mrp: s.mrp,
      });
    }
  }

  const historyWrite =
    cheapestPerPharmacy.size > 0
      ? prisma.priceHistory.createMany({
          data: Array.from(cheapestPerPharmacy.entries()).map(
            ([pharmacyName, p]) => ({
              medicineId: medRow.id,
              pharmacyName,
              sellingPrice: p.sellingPrice,
              mrp: p.mrp,
            })
          ),
        })
      : Promise.resolve(null);

  // Salt mapping to Jan Aushadhi
  const matchTarget = saltComposition ?? medRow.brandName ?? medRow.name;
  const saltMappingWrite = findJanAushadhiMatch(matchTarget)
    .then((match) => {
      if (!match) return null;
      return prisma.saltMapping.upsert({
        where: {
          medicineId_janAushadhiProductId: {
            medicineId: medRow.id,
            janAushadhiProductId: match.product.id,
          },
        },
        update: { matchConfidence: match.confidence },
        create: {
          medicineId: medRow.id,
          janAushadhiProductId: match.product.id,
          matchConfidence: match.confidence,
        },
      });
    })
    .catch(() => null);

  await Promise.all([medUpdate, listingWrite, historyWrite, saltMappingWrite]);
}

/**
 * Filter raw scrape results down to listings that actually match the
 * catalog medicine (rejecting cross-sells / wrong strengths / wrong
 * formulation), then persist the matched listings, refresh price history,
 * and update the salt → Jan Aushadhi mapping.
 *
 * Used by both the live-scrape path and the SWR background refresh.
 *
 * Returns the count of listings that survived filtering so the caller can
 * decide whether to surface a "no match" message.
 */
async function persistScrapeResults(
  medRow: any,
  scraped: ScrapedListing[],
  pincode: string | null,
  requestedPack: number | null = null
): Promise<{ relevantCount: number }> {
  // FILTER scraped results to ones that actually match what the user picked.
  //
  // Pharmacy search results include cross-sells ("Crocin 650" search returns
  // "Crocin Advance" suggestions, etc.). We need ALL distinctive parts of the
  // brand to appear in the product name — including the strength number,
  // since "Crocin 650" vs "Crocin Advance" is differentiated by 650 vs the
  // word "Advance".
  //
  // Strategy:
  //   - Tokenize brand name (or fallback to medicine name) into alpha + numeric tokens.
  //   - Require ALL tokens to match the product name with word-boundary regex.
  //   - For numeric tokens, allow an optional unit suffix (mg, mcg, ml, %, etc.)
  //     since pharmacies write "650mg" or "650 mg" interchangeably.

  const escapeRe = (s: string) =>
    s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

  const tokenRegex = (tok: string): RegExp => {
    const esc = escapeRe(tok);
    if (/^\d+(\.\d+)?$/.test(tok)) {
      // Numeric: allow optional unit suffix glued or spaced after digits
      return new RegExp(
        `\\b${esc}(?:\\s?(?:mg|mcg|ml|gm|g|iu|%))?\\b`,
        "i"
      );
    }
    return new RegExp(`\\b${esc}\\b`, "i");
  };

  const sourceText: string = medRow.brandName ?? medRow.name;
  const brandTokens = sourceText
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t: string) =>
        t.length >= 1 &&
        t !== "." &&
        !["tablet", "capsule", "syrup", "drops", "injection", "cream", "gel"].includes(t)
    );

  const tokenRegexes = brandTokens.map(tokenRegex);
  const brandSet = new Set(brandTokens);

  // Bundle/multi-pack blacklist — these are not the standard SKU.
  // "Combo Pack of...", "Fever Management Combo... & Crocin", "Pack of 4 strips" etc.
  const BUNDLE_RE =
    /\b(combo|hamper|combination|with\s+free)\b|\bpack\s+of\s+([2-9]|\d{2,})\b|\bthermometer\b|&\s/i;

  // Pull the catalog primary strength so we can reject mismatches.
  // e.g., Crocin 650 catalog has 650mg; reject scraped "Crocin Advance 500mg".
  let primaryStrength: number | null = null;
  let primaryUnit: string | null = null;
  if (medRow.ingredients) {
    try {
      const parsed = JSON.parse(medRow.ingredients);
      if (Array.isArray(parsed) && parsed[0]?.strength) {
        primaryStrength = Number(parsed[0].strength);
        primaryUnit = String(parsed[0].unit ?? "").toLowerCase();
      }
    } catch {
      /* ignore */
    }
  }

  // Decide whether a bare number in the product name is a count (pack size,
  // tablet count) or a strength.
  const isCountContext = (name: string, num: number): boolean => {
    // Apostrophe-s: "10's", "20's"
    if (new RegExp(`\\b${num}\\s?'s\\b`, "i").test(name)) return true;
    // "Strip of 15", "Pack of 100", "Bottle of 30", "Box of 4"
    if (
      new RegExp(
        `(?:strip|pack|bottle|box|jar|carton)\\s+of\\s+${num}\\b`,
        "i"
      ).test(name)
    )
      return true;
    // Small number directly before tablets/capsules/drops/sachets etc.
    if (
      num < 50 &&
      new RegExp(
        `\\b${num}\\s?(?:tab(?:lets?)?|cap(?:sules?)?|drops?|sachets?|pieces?|units?)\\b`,
        "i"
      ).test(name)
    )
      return true;
    return false;
  };

  // Extract dosage strengths from a product name. Two passes:
  //   1. Numbers with an explicit unit (mg/mcg/gm/iu/%) — high confidence.
  //   2. Bare 2-4 digit numbers ≥50 that aren't in a count context — likely
  //      strength even when the merchant didn't write "mg" explicitly
  //      (e.g., "Crocin 650 Advance Tablet").
  const extractStrengths = (name: string): number[] => {
    const lower = name.toLowerCase();
    const out: number[] = [];

    // Pass 1: explicit unit
    const unitMatches =
      lower.match(/\b(\d+(?:\.\d+)?)\s?(?:mg|mcg|gm|iu|%)\b/g) ?? [];
    for (const m of unitMatches) {
      const n = parseFloat(m);
      if (!isNaN(n)) out.push(n);
    }

    // Pass 2: bare numbers ≥ 50 not in count context
    const bareMatches = lower.match(/\b(\d{2,4}(?:\.\d+)?)\b/g) ?? [];
    for (const m of bareMatches) {
      const n = parseFloat(m);
      if (isNaN(n) || n < 50) continue;
      if (out.includes(n)) continue;
      // Skip if it's a volume ("60ml") — different unit, not a strength conflict
      if (new RegExp(`\\b${m}\\s?ml\\b`, "i").test(name)) continue;
      if (isCountContext(name, n)) continue;
      out.push(n);
    }

    return out;
  };

  // Fallback: if ingredients didn't provide a strength, try to recover one
  // from the catalog medicine name itself. "Telma 40 Tablet" → 40. Only used
  // when exactly one strength is parseable from the source text — otherwise
  // we leave primaryStrength null to avoid false rejections.
  if (primaryStrength == null) {
    const fromName = extractStrengths(sourceText);
    if (fromName.length === 1) {
      primaryStrength = fromName[0];
    }
  }

  // Pack-count parsing: the catalog's canonical strip count (when available)
  // is the default filter; explicit ?packSize= overrides it.
  const catalogPackCount = extractPackCount(medRow.packSize, sourceText);
  const targetPackCount: number | null = requestedPack ?? catalogPackCount;

  // Formulation suffixes — different release profiles / delivery mechanisms.
  // "Avomine Tablet" and "Avomine Tablet MD" are clinically different products.
  // We extract the suffix set from both the catalog name and each scraped
  // product, and reject any mismatch.
  const FORMULATION_SUFFIXES = [
    "md",   // Mouth Dissolving
    "odt",  // Orally Disintegrating Tablet
    "dt",   // Dispersible Tablet
    "sr",   // Sustained Release
    "er",   // Extended Release
    "xl",   // Extended Long
    "xr",   // Extended Release
    "cr",   // Controlled Release
    "pr",   // Prolonged Release
    "la",   // Long Acting
    "ir",   // Immediate Release
    "fc",   // Film Coated
    "ec",   // Enteric Coated
    "chewable",
  ];
  const extractSuffixes = (name: string): Set<string> => {
    const lower = name.toLowerCase();
    const found = new Set<string>();
    for (const sfx of FORMULATION_SUFFIXES) {
      if (new RegExp(`\\b${sfx}\\b`, "i").test(lower)) {
        found.add(sfx);
      }
    }
    return found;
  };
  const catalogSuffixes = extractSuffixes(sourceText);

  // Dosage form groups — "Tablet" and "Injection" are fundamentally different
  // products even when they share a brand name.
  const DOSAGE_FORM_GROUPS: Record<string, string[]> = {
    tablet:      ["tablet", "tablets", "tab", "tabs"],
    capsule:     ["capsule", "capsules", "cap", "caps", "softgel", "softgels"],
    syrup:       ["syrup", "suspension", "oral solution", "liquid", "elixir"],
    injection:   ["injection", "injections", "inj", "vial", "ampoule"],
    drops:       ["drops", "drop"],
    cream:       ["cream"],
    gel:         ["gel"],
    ointment:    ["ointment"],
    inhaler:     ["inhaler", "rotacaps", "respules"],
    spray:       ["spray"],
    powder:      ["powder", "sachet", "granules"],
    patch:       ["patch", "patches"],
    suppository: ["suppository", "suppositories"],
  };

  const allFormKeywords = new Map<string, string>();
  for (const [group, keywords] of Object.entries(DOSAGE_FORM_GROUPS)) {
    for (const kw of keywords) allFormKeywords.set(kw, group);
  }

  const detectDosageGroup = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const [kw, group] of allFormKeywords) {
      if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) return group;
    }
    return null;
  };

  const catalogDosageGroup: string | null = medRow.dosageForm
    ? detectDosageGroup(medRow.dosageForm) ?? detectDosageGroup(sourceText)
    : detectDosageGroup(sourceText);

  let relevantScraped = scraped;
  if (tokenRegexes.length > 0) {
    relevantScraped = scraped.filter((s) => {
      // 1. Reject obvious bundles / multi-packs
      if (BUNDLE_RE.test(s.productName)) return false;

      // 2. Brand tokens must all be present
      if (!tokenRegexes.every((re: RegExp) => re.test(s.productName))) return false;

      // 3. If we know the primary strength, the product's strengths (if any
      //    are mentioned) must include ours. If the product lists no strength
      //    at all we accept it (some listings just say "Avomine Tablet 10's").
      if (primaryStrength != null) {
        const prodStrengths = extractStrengths(s.productName);
        if (prodStrengths.length > 0 && !prodStrengths.includes(primaryStrength)) {
          return false;
        }
      }

      // 4. Formulation suffix must match. If catalog says plain "Avomine
      //    Tablet" (no MD/SR/etc.), reject "Avomine 25mg Tablet MD". If
      //    catalog explicitly has "MD", require the product to have it too.
      const prodSuffixes = extractSuffixes(s.productName);
      if (catalogSuffixes.size === 0 && prodSuffixes.size > 0) return false;
      for (const sfx of catalogSuffixes) {
        if (!prodSuffixes.has(sfx)) return false;
      }

      // 5. Dosage form must match. "Meftal Spas Tablet" must not return
      //    "Meftal Spas Injection". If the product mentions a dosage form
      //    that belongs to a different group, reject it. If the product
      //    mentions no form at all, accept (some listings omit it).
      if (catalogDosageGroup) {
        const prodGroup = detectDosageGroup(s.productName);
        if (prodGroup && prodGroup !== catalogDosageGroup) return false;
      }

      // 6. For short brand names (1-2 tokens), reject products where the
      //    brand is buried deep in the name (likely cross-sell).
      if (brandTokens.length <= 2) {
        const prodWords = s.productName
          .toLowerCase()
          .replace(/[^a-z0-9.\s]/g, " ")
          .split(/\s+/)
          .filter(Boolean);
        const firstBrandIdx = prodWords.findIndex((w) =>
          brandTokens.some((bt) => w === bt || w.startsWith(bt))
        );
        if (brandTokens.length === 1 && firstBrandIdx >= 3) return false;

        const extraWords = prodWords.filter(
          (w) =>
            !brandSet.has(w) &&
            !NOISE_TOKENS.has(w) &&
            !/^\d+(\.\d+)?$/.test(w)
        );
        if (extraWords.length > 4) return false;

        // 6b. Salt-variant suffix rejection — see lib/search/filter.ts for
        // the canonical comment. Catches "Telma D Tablet" when catalog is
        // plain "Telma".
        if (brandTokens.length === 1 && firstBrandIdx >= 0) {
          const nextWord = prodWords[firstBrandIdx + 1];
          if (
            nextWord &&
            /^[a-z]+$/.test(nextWord) &&
            !NOISE_TOKENS.has(nextWord) &&
            !FORMULATION_SUFFIXES.includes(nextWord) &&
            !brandSet.has(nextWord)
          ) {
            return false;
          }
        }
      }

      // 7. Pack-count match. Reject ONLY when both sides have a confidently
      // parseable pack count and they differ.
      if (targetPackCount != null) {
        const prodPack = extractPackCount(s.productName, s.packSize);
        if (prodPack != null && prodPack !== targetPackCount) return false;
      }

      return true;
    });
    // No fallback — better to return empty than to leak cross-sell results.
  }

  // Per-pharmacy dedup: a single search like "Spas" otherwise yields Spas
  // Tablet, Spas DS, Spas Suspension, Spas Injection from the same pharmacy.
  // Pick the listing whose product name best matches the canonical brand+form.
  relevantScraped = dedupePerPharmacy(relevantScraped, sourceText, brandTokens);

  if (relevantScraped.length === 0) {
    // Zero relevant listings → strip this row from autocomplete and wipe
    // stale prior listings. Same logic as persistFinalListings.
    await Promise.all([
      prisma.medicine
        .update({ where: { id: medRow.id }, data: { hasInStock: false } })
        .catch(() => null),
      prisma.pharmacyListing
        .deleteMany({ where: { medicineId: medRow.id } })
        .catch(() => null),
    ]);
    return { relevantCount: 0 };
  }

  // Per-product serviceability checks: for each deduplicated listing, hit the
  // pharmacy's product page to get real stock status and refresh pricing.
  // Runs only when the user provided a pincode (otherwise there's nothing to
  // check). Parallel with a hard 2.5 s timeout per pharmacy; falls back to the
  // static estimate from lib/delivery.ts on error or timeout.
  let svcResults: Awaited<ReturnType<typeof checkServiceability>> | null = null;
  if (pincode) {
    try {
      svcResults = await checkServiceability(relevantScraped, pincode);
    } catch (e) {
      console.error("[serviceability] checkAll failed:", (e as Error).message);
    }
  }

  // Merge serviceability results back into the listings so the DB row reflects
  // real stock and, where available, location-specific pricing.
  if (svcResults) {
    relevantScraped = relevantScraped.map((s) => {
      const svc = svcResults!.get(s.pharmacyName);
      if (!svc) return s;
      return {
        ...s,
        inStock: svc.inStock,
        // For pharmacies that return a location-specific price (e.g. 1mg Delhi
        // vs Mumbai), prefer it over the national search price.
        sellingPrice: svc.price ?? s.sellingPrice,
        mrp: svc.mrp ?? s.mrp,
      };
    });
  }

  // Update saltComposition. For catalog entries we trust the curated value
  // and never overwrite it. For non-catalog entries the existing value may
  // be stale/wrong (e.g., from a prior scrape that picked up a cross-sell
  // product's salt), so we always refresh it from the new strict scrape.
  const newSalt =
    relevantScraped.find((s) => s.saltComposition)?.saltComposition ?? null;

  const saltComposition = medRow.isCatalog
    ? medRow.saltComposition ?? newSalt
    : newSalt ?? medRow.saltComposition;

  // hasInStock drives autocomplete visibility — true if at least one
  // pharmacy listing is buyable. Mirrors the per-listing logic below.
  const hasInStock = relevantScraped.some((s) => {
    const svc = svcResults?.get(s.pharmacyName);
    const eta = svc
      ? { serviceable: svc.serviceable }
      : estimateDelivery(s.pharmacyName, pincode);
    const hasPrice = s.sellingPrice != null || s.mrp != null;
    return s.inStock && eta.serviceable && hasPrice;
  });

  // Auto-promote: if this is a non-catalog entry and we got a clean scrape,
  // populate brandName from the first relevant listing for future searches.
  if (!medRow.isCatalog) {
    const firstListing = relevantScraped[0];
    const detectedBrand = firstListing?.brandName ?? medRow.name;
    await prisma.medicine.update({
      where: { id: medRow.id },
      data: {
        hasInStock,
        saltComposition: saltComposition ?? undefined,
        brandName: medRow.brandName ?? detectedBrand,
        packSize: medRow.packSize ?? firstListing?.packSize ?? undefined,
      },
    });
  } else {
    await prisma.medicine.update({
      where: { id: medRow.id },
      data: {
        hasInStock,
        ...(saltComposition && !medRow.saltComposition
          ? { saltComposition }
          : {}),
      },
    });
  }

  // Replace listings (only the ones relevant to this brand)
  await prisma.pharmacyListing.deleteMany({ where: { medicineId: medRow.id } });
  await prisma.pharmacyListing.createMany({
    data: relevantScraped.map((s) => {
      const svc = svcResults?.get(s.pharmacyName);
      const eta = svc
        ? { eta: svc.deliveryEta ?? estimateDelivery(s.pharmacyName, pincode).eta, serviceable: svc.serviceable }
        : estimateDelivery(s.pharmacyName, pincode);
      // Listings without ANY price are not buyable, regardless of what the
      // scraper detected — discontinued / not-for-online-sale products on
      // pharmacy sites often hide the price entirely.
      const hasPrice = s.sellingPrice != null || s.mrp != null;
      // locationPrice: the price from the serviceability check if it differs
      // from the search-API price (indicates per-pincode pricing, e.g. 1mg).
      const locationPrice =
        svc?.price != null && svc.price !== s.sellingPrice
          ? svc.price
          : null;
      return {
        medicineId: medRow!.id,
        pharmacyName: s.pharmacyName,
        brandName: s.brandName,
        productName: s.productName,
        packSize: s.packSize,
        mrp: s.mrp,
        sellingPrice: s.sellingPrice,
        discountPercent: s.discountPercent,
        // Mark as out of stock if we know the pincode is unserviceable, or
        // if the listing has no price (can't actually be bought).
        inStock: s.inStock && eta.serviceable && hasPrice,
        productUrl: s.productUrl,
        deliveryEta: eta.eta,
        serviceable: eta.serviceable,
        locationPrice,
        pincode: pincode ?? null,
      };
    }),
  });

  // Price history snapshot — cheapest in-stock per pharmacy
  const cheapestPerPharmacy = new Map<
    string,
    { sellingPrice?: number; mrp?: number }
  >();
  for (const s of relevantScraped) {
    if (!s.inStock) continue;
    const cur = cheapestPerPharmacy.get(s.pharmacyName);
    const price = s.sellingPrice ?? s.mrp;
    if (price == null) continue;
    if (!cur || (cur.sellingPrice ?? cur.mrp ?? Infinity) > price) {
      cheapestPerPharmacy.set(s.pharmacyName, {
        sellingPrice: s.sellingPrice,
        mrp: s.mrp,
      });
    }
  }
  if (cheapestPerPharmacy.size > 0) {
    await prisma.priceHistory.createMany({
      data: Array.from(cheapestPerPharmacy.entries()).map(
        ([pharmacyName, p]) => ({
          medicineId: medRow!.id,
          pharmacyName,
          sellingPrice: p.sellingPrice,
          mrp: p.mrp,
        })
      ),
    });
  }

  // Salt mapping to Jan Aushadhi
  const matchTarget = saltComposition ?? medRow.brandName ?? medRow.name;
  const match = await findJanAushadhiMatch(matchTarget);
  if (match) {
    await prisma.saltMapping
      .upsert({
        where: {
          medicineId_janAushadhiProductId: {
            medicineId: medRow.id,
            janAushadhiProductId: match.product.id,
          },
        },
        update: { matchConfidence: match.confidence },
        create: {
          medicineId: medRow.id,
          janAushadhiProductId: match.product.id,
          matchConfidence: match.confidence,
        },
      })
      .catch(() => {});
  }

  return { relevantCount: relevantScraped.length };
}

const NOISE_TOKENS = new Set([
  "tablet", "tablets", "capsule", "capsules", "tab", "tabs", "cap", "caps",
  "strip", "strips", "bottle", "pack", "of", "syrup", "drops", "injection",
  "cream", "gel", "ointment", "suspension", "solution", "sachet", "sachets",
  "piece", "pieces", "unit", "units", "box", "jar", "carton", "ml", "mg",
  "mcg", "gm", "g", "iu",
]);

function dedupePerPharmacy(
  listings: ScrapedListing[],
  sourceText: string,
  brandTokens: string[]
): ScrapedListing[] {
  const sourceLower = sourceText.toLowerCase();
  const brandSet = new Set(brandTokens.map((t) => t.toLowerCase()));

  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter(Boolean);

  const score = (productName: string): number => {
    const name = productName.toLowerCase();
    // Exact substring of canonical brand+form is strongest signal.
    let s = name.includes(sourceLower) ? 100 : 0;
    const tokens = tokenize(productName);
    for (const t of tokens) {
      if (brandSet.has(t)) s += 5;
      else if (!NOISE_TOKENS.has(t) && !/^\d+(\.\d+)?$/.test(t)) {
        // Extra non-noise word (e.g. "DS", "Plus", "MD") penalises.
        s -= 2;
      }
    }
    // Shorter names win on ties.
    s -= productName.length * 0.01;
    return s;
  };

  const best = new Map<string, ScrapedListing>();
  const bestScore = new Map<string, number>();
  for (const l of listings) {
    const sc = score(l.productName);
    const cur = bestScore.get(l.pharmacyName);
    if (cur === undefined || sc > cur) {
      best.set(l.pharmacyName, l);
      bestScore.set(l.pharmacyName, sc);
    } else if (sc === cur) {
      // Tie-break: prefer in-stock first, then lower price. Picking a cheap
      // OOS SKU over an in-stock equivalent leaves the user staring at "Out
      // of stock" when the pharmacy actually has it.
      const curListing = best.get(l.pharmacyName)!;
      const curPrice = curListing.sellingPrice ?? curListing.mrp ?? Infinity;
      const newPrice = l.sellingPrice ?? l.mrp ?? Infinity;
      if (l.inStock && !curListing.inStock) {
        best.set(l.pharmacyName, l);
      } else if (l.inStock === curListing.inStock && newPrice < curPrice) {
        best.set(l.pharmacyName, l);
      }
    }
  }
  return Array.from(best.values());
}

/**
 * Decorate the medicine row with auxiliary fields the UI uses:
 *   - drugDetail: curated uses/sideEffects/warnings (falls back to DB row)
 *   - listings: ensure each has a `deliveryEta` (compute on the fly for legacy rows)
 */
function enrich(med: any, pincode: string | null, requestedPack: number | null = null) {
  if (!med) return med;
  const detail = lookupDrugDetail(med.brandName, med.ingredients);
  const drugDetail = {
    uses: med.uses ?? detail?.uses ?? null,
    howItWorks: med.howItWorks ?? detail?.howItWorks ?? null,
    sideEffects: med.sideEffects ?? detail?.sideEffects ?? null,
    warnings: med.warnings ?? detail?.warnings ?? null,
    storage: med.storage ?? detail?.storage ?? null,
    prescriptionRequired:
      med.prescriptionRequired ?? detail?.prescriptionRequired ?? false,
    soldOnline: med.soldOnline ?? detail?.soldOnline ?? true,
  };
  // Strip static-heuristic ETAs from cached rows. Old listings stored values
  // like "Tomorrow" / "2-3 days" from `estimateDelivery`. Those aren't real
  // pharmacy ETAs — better to show nothing than a fake one. Real ETAs from
  // the live PharmEasy/1mg endpoints look like "Delivery by Thu 14 May…" or
  // "Get in 30 minutes" and don't match these patterns.
  const looksLikeStaticEta = (s: string | null | undefined): boolean => {
    if (!s) return true;
    const t = s.trim();
    return (
      /^(today|tomorrow|today\s*\/\s*tomorrow)$/i.test(t) ||
      /^\d+(?:-\d+)?\s*days?$/i.test(t)
    );
  };
  let listings = (med.listings ?? []).map((l: any) => ({
    ...l,
    deliveryEta: looksLikeStaticEta(l.deliveryEta) ? null : l.deliveryEta,
  }));

  // Read-time filtering: cached listings may predate the dosage form /
  // dedup / relevance filters added in persistScrapeResults. Apply the
  // same checks here so stale DB rows never reach the client.
  listings = postFilterListings(listings, med, requestedPack);

  const saltMappings = med.saltMappings ?? [];
  return { ...med, listings, saltMappings, drugDetail };
}

/**
 * Read-time filter applied to DB listings before sending to the client.
 * Mirrors the write-time logic in persistScrapeResults so that stale
 * cached data is cleaned up on the fly.
 */
function postFilterListings(
  listings: any[],
  med: any,
  requestedPack: number | null = null
): any[] {
  if (!listings.length || !med) return listings;

  // Mirror buildFilterContext's target pack-count derivation: prefer the
  // user-requested size, else the catalog's canonical pack count.
  const catalogPackCountForFilter = extractPackCount(
    med.packSize ?? null,
    med.brandName ?? med.name ?? ""
  );
  const targetPackCountForFilter: number | null =
    requestedPack ?? catalogPackCountForFilter;

  const FORM_GROUPS: Record<string, string[]> = {
    tablet:      ["tablet", "tablets", "tab", "tabs"],
    capsule:     ["capsule", "capsules", "cap", "caps", "softgel", "softgels"],
    syrup:       ["syrup", "suspension", "oral solution", "liquid", "elixir"],
    injection:   ["injection", "injections", "inj", "vial", "ampoule"],
    drops:       ["drops", "drop"],
    cream:       ["cream"],
    gel:         ["gel"],
    ointment:    ["ointment"],
    inhaler:     ["inhaler", "rotacaps", "respules"],
    spray:       ["spray"],
    powder:      ["powder", "sachet", "granules"],
    patch:       ["patch", "patches"],
    suppository: ["suppository", "suppositories"],
  };

  const kwToGroup = new Map<string, string>();
  for (const [group, kws] of Object.entries(FORM_GROUPS)) {
    for (const kw of kws) kwToGroup.set(kw, group);
  }

  const detectGroup = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const [kw, group] of kwToGroup) {
      if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) return group;
    }
    return null;
  };

  const catalogGroup = med.dosageForm
    ? detectGroup(med.dosageForm)
    : detectGroup(med.brandName ?? med.name ?? "");

  const sourceText: string = med.brandName ?? med.name ?? "";
  const brandTokens = sourceText
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t: string) =>
        t.length >= 1 &&
        t !== "." &&
        !["tablet", "capsule", "syrup", "drops", "injection", "cream", "gel"].includes(t)
    );
  const brandSet = new Set(brandTokens);

  const tokenRegexes = brandTokens.map((tok: string) => {
    const esc = tok.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    if (/^\d+(\.\d+)?$/.test(tok)) {
      return new RegExp(`\\b${esc}(?:\\s?(?:mg|mcg|ml|gm|g|iu|%))?\\b`, "i");
    }
    return new RegExp(`\\b${esc}\\b`, "i");
  });

  const BUNDLE_RE =
    /\b(combo|hamper|combination|with\s+free)\b|\bpack\s+of\s+([2-9]|\d{2,})\b|\bthermometer\b|&\s/i;

  let filtered = listings.filter((l: any) => {
    const name = l.productName ?? "";
    if (!name) return true;

    if (BUNDLE_RE.test(name)) return false;

    if (tokenRegexes.length > 0 && !tokenRegexes.every((re: RegExp) => re.test(name))) {
      return false;
    }

    if (catalogGroup) {
      const prodGroup = detectGroup(name);
      if (prodGroup && prodGroup !== catalogGroup) return false;
    }

    if (brandTokens.length <= 2 && brandTokens.length > 0) {
      const prodWords = name.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter(Boolean);
      const firstBrandIdx = prodWords.findIndex((w: string) =>
        brandTokens.some((bt: string) => w === bt || w.startsWith(bt))
      );
      if (brandTokens.length === 1 && firstBrandIdx >= 3) return false;

      const extraWords = prodWords.filter(
        (w: string) => !brandSet.has(w) && !NOISE_TOKENS.has(w) && !/^\d+(\.\d+)?$/.test(w)
      );
      if (extraWords.length > 4) return false;

      // Salt-variant rejection: e.g. "Telma D Tablet" vs catalog "Telma".
      if (brandTokens.length === 1 && firstBrandIdx >= 0) {
        const nextWord = prodWords[firstBrandIdx + 1];
        const POST_BRAND_ALLOWLIST = new Set([
          "md", "odt", "dt", "sr", "er", "xl", "xr", "cr", "pr", "la", "ir",
          "fc", "ec", "chewable",
        ]);
        if (
          nextWord &&
          /^[a-z]+$/.test(nextWord) &&
          !NOISE_TOKENS.has(nextWord) &&
          !POST_BRAND_ALLOWLIST.has(nextWord) &&
          !brandSet.has(nextWord)
        ) {
          return false;
        }
      }
    }

    // Pack-count match (cached listings carry packSize + productName too).
    if (targetPackCountForFilter != null) {
      const prodPack = extractPackCount(l.productName ?? "", l.packSize ?? "");
      if (prodPack != null && prodPack !== targetPackCountForFilter) return false;
    }

    return true;
  });

  // Per-pharmacy dedup: keep best match per pharmacy
  const sourceLower = sourceText.toLowerCase();
  const score = (name: string): number => {
    const lower = name.toLowerCase();
    let s = lower.includes(sourceLower) ? 100 : 0;
    const tokens = lower.replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (brandSet.has(t)) s += 5;
      else if (!NOISE_TOKENS.has(t) && !/^\d+(\.\d+)?$/.test(t)) s -= 2;
    }
    s -= name.length * 0.01;
    return s;
  };

  const best = new Map<string, any>();
  const bestScore = new Map<string, number>();
  for (const l of filtered) {
    const sc = score(l.productName ?? "");
    const cur = bestScore.get(l.pharmacyName);
    if (cur === undefined || sc > cur) {
      best.set(l.pharmacyName, l);
      bestScore.set(l.pharmacyName, sc);
    } else if (sc === cur) {
      const curL = best.get(l.pharmacyName)!;
      const curPrice = curL.sellingPrice ?? curL.mrp ?? Infinity;
      const newPrice = l.sellingPrice ?? l.mrp ?? Infinity;
      if (newPrice < curPrice) best.set(l.pharmacyName, l);
    }
  }
  filtered = Array.from(best.values());

  // Re-sort: in-stock first, then by price
  filtered.sort((a: any, b: any) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    const ap = a.sellingPrice ?? a.mrp ?? Infinity;
    const bp = b.sellingPrice ?? b.mrp ?? Infinity;
    return ap - bp;
  });

  return filtered;
}
