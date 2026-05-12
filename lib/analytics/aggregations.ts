import { prisma } from "@/lib/prisma";

export type Window = "1h" | "24h" | "7d" | "30d" | "all";

export function windowToDate(w: Window): Date {
  const ms: Record<Window, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    all: 100 * 365 * 24 * 60 * 60 * 1000,
  };
  return new Date(Date.now() - ms[w]);
}

function pct(num: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((num / denom) * 10000) / 100;
}

export async function liveStrip() {
  const since60s = new Date(Date.now() - 60_000);
  const since5m = new Date(Date.now() - 5 * 60_000);
  const since15m = new Date(Date.now() - 15 * 60_000);
  const since1h = new Date(Date.now() - 60 * 60_000);

  const [
    searches60s,
    clicks60s,
    activeSessions,
    uploads1h,
    topMedRows,
    topPincodeRows,
    apiLatencyRow,
    apiErrors1h,
  ] = await Promise.all([
    prisma.searchLog.count({ where: { createdAt: { gte: since60s } } }),
    prisma.clickLog.count({ where: { createdAt: { gte: since60s } } }),
    prisma.pageView
      .findMany({
        where: { createdAt: { gte: since5m } },
        select: { sid: true },
        distinct: ["sid"],
      })
      .then((rs) => rs.length),
    prisma.ocrUpload.count({ where: { createdAt: { gte: since1h } } }),
    prisma.searchLog.groupBy({
      by: ["medicineId"],
      where: { createdAt: { gte: since15m }, medicineId: { not: null } },
      _count: { medicineId: true },
      orderBy: { _count: { medicineId: "desc" } },
      take: 1,
    }),
    prisma.searchLog.groupBy({
      by: ["pincode"],
      where: { createdAt: { gte: since15m }, pincode: { not: null } },
      _count: { pincode: true },
      orderBy: { _count: { pincode: "desc" } },
      take: 1,
    }),
    prisma.$queryRaw<{ p95: number | null; p50: number | null }[]>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::int AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::int AS p95
      FROM "ApiLog" WHERE "createdAt" >= ${since5m}
    `.catch(() => [{ p50: null, p95: null }]),
    prisma.apiLog.count({
      where: { createdAt: { gte: since1h }, statusCode: { gte: 500 } },
    }),
  ]);

  let topMedicine: { name: string; count: number } | null = null;
  if (topMedRows[0]?.medicineId) {
    const med = await prisma.medicine.findUnique({
      where: { id: topMedRows[0].medicineId },
      select: { name: true, brandName: true },
    });
    if (med) {
      topMedicine = {
        name: med.brandName ?? med.name,
        count: topMedRows[0]._count.medicineId,
      };
    }
  }

  return {
    searches60s,
    clicks60s,
    activeSessions,
    uploads1h,
    topMedicine,
    topPincode: topPincodeRows[0]
      ? { pincode: topPincodeRows[0].pincode, count: topPincodeRows[0]._count.pincode }
      : null,
    apiLatencyMsP50: apiLatencyRow[0]?.p50 ?? null,
    apiLatencyMsP95: apiLatencyRow[0]?.p95 ?? null,
    errors1h: apiErrors1h,
  };
}

export async function trafficPanel(w: Window) {
  const since = windowToDate(w);
  const [sessionRows, pvRows, deviceRows, referrerRows, pathRows] = await Promise.all([
    prisma.session.findMany({
      where: { lastSeenAt: { gte: since } },
      select: { sid: true, firstSeenAt: true, deviceClass: true, lastSeenAt: true },
    }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: since } },
      select: { sid: true, path: true, meta: true, createdAt: true },
    }),
    prisma.session.groupBy({
      by: ["deviceClass"],
      where: { lastSeenAt: { gte: since } },
      _count: { sid: true },
    }),
    prisma.pageView.groupBy({
      by: ["meta"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),
  ]);

  const sessions = sessionRows.length;
  const newSessions = sessionRows.filter((s) => s.firstSeenAt >= since).length;
  const returning = sessions - newSessions;

  const pvBySid = new Map<string, number>();
  for (const pv of pvRows) {
    pvBySid.set(pv.sid, (pvBySid.get(pv.sid) ?? 0) + 1);
  }
  const buckets = { "1": 0, "2-3": 0, "4-9": 0, "10+": 0 };
  for (const count of pvBySid.values()) {
    if (count === 1) buckets["1"]++;
    else if (count <= 3) buckets["2-3"]++;
    else if (count <= 9) buckets["4-9"]++;
    else buckets["10+"]++;
  }
  const bounceRate = pct(buckets["1"], sessions);

  // Per-hour series
  const hours = w === "1h" ? 60 : w === "24h" ? 24 : w === "7d" ? 7 * 24 : 30;
  const bucketMs = w === "1h" ? 60_000 : 60 * 60_000;
  const denom = w === "7d" || w === "30d" ? 24 * 60 * 60_000 : bucketMs;
  const timeseries: { t: number; pageviews: number; sessions: number }[] = [];
  const now = Date.now();
  const sidByBucket = new Map<number, Set<string>>();
  for (const pv of pvRows) {
    const b = Math.floor((pv.createdAt.getTime() - (now - hours * bucketMs)) / denom);
    if (b < 0) continue;
    if (!sidByBucket.has(b)) sidByBucket.set(b, new Set());
    sidByBucket.get(b)!.add(pv.sid);
  }
  const pvByBucket = new Map<number, number>();
  for (const pv of pvRows) {
    const b = Math.floor((pv.createdAt.getTime() - (now - hours * bucketMs)) / denom);
    if (b < 0) continue;
    pvByBucket.set(b, (pvByBucket.get(b) ?? 0) + 1);
  }
  const totalBuckets = w === "7d" ? 7 : w === "30d" ? 30 : hours;
  for (let i = 0; i < totalBuckets; i++) {
    timeseries.push({
      t: now - (totalBuckets - 1 - i) * denom,
      pageviews: pvByBucket.get(i) ?? 0,
      sessions: sidByBucket.get(i)?.size ?? 0,
    });
  }

  return {
    sessions,
    newSessions,
    returning,
    pageviews: pvRows.length,
    bounceRate,
    pageviewsPerSession: buckets,
    deviceBreakdown: deviceRows.map((r) => ({
      device: r.deviceClass ?? "unknown",
      count: r._count.sid,
    })),
    referrerBreakdown: referrerRows.map((r) => ({
      referrer: r.meta ?? "direct",
      count: r._count.id,
    })),
    topPaths: pathRows.map((r) => ({ path: r.path, count: r._count.id })),
    timeseries,
  };
}

export async function geographyPanel(w: Window) {
  const since = windowToDate(w);

  const [pincodeRows, stateRows, sessionPincodes, jaStores] = await Promise.all([
    prisma.searchLog.groupBy({
      by: ["pincode"],
      where: { createdAt: { gte: since }, pincode: { not: null } },
      _count: { pincode: true },
      orderBy: { _count: { pincode: "desc" } },
      take: 20,
    }),
    prisma.session.groupBy({
      by: ["state"],
      where: { lastSeenAt: { gte: since }, state: { not: null } },
      _count: { sid: true },
      orderBy: { _count: { sid: "desc" } },
      take: 30,
    }),
    prisma.session.findMany({
      where: { lastSeenAt: { gte: since }, pincode: { not: null } },
      select: { pincode: true, city: true, state: true },
    }),
    prisma.janAushadhiStore.findMany({
      select: { pincode: true, state: true },
      where: { pincode: { not: null } },
    }),
  ]);

  const jaPincodes = new Set(jaStores.map((s) => s.pincode).filter(Boolean) as string[]);
  const jaAccessiblePincodes = pincodeRows.filter((p) => p.pincode && jaPincodes.has(p.pincode)).length;

  const jaByState = new Map<string, number>();
  for (const s of jaStores) {
    if (!s.state) continue;
    jaByState.set(s.state, (jaByState.get(s.state) ?? 0) + 1);
  }

  const sessionsByState = new Map<string, number>();
  for (const s of sessionPincodes) {
    if (s.state) {
      sessionsByState.set(s.state, (sessionsByState.get(s.state) ?? 0) + 1);
    }
  }

  return {
    topPincodes: pincodeRows.map((p) => ({
      pincode: p.pincode,
      count: p._count.pincode,
    })),
    topStates: stateRows.map((s) => ({ state: s.state ?? "unknown", count: s._count.sid })),
    jaAccessiblePincodes,
    jaCoverageByState: Array.from(jaByState.entries()).map(([state, kendras]) => ({
      state,
      kendras,
      sessions: sessionsByState.get(state) ?? 0,
    })),
  };
}

export async function medicineTaxonomyPanel(w: Window) {
  const since = windowToDate(w);

  const searches = await prisma.searchLog.findMany({
    where: { createdAt: { gte: since }, medicineId: { not: null } },
    select: { medicineId: true },
  });
  const counts = new Map<string, number>();
  for (const s of searches) {
    if (!s.medicineId) continue;
    counts.set(s.medicineId, (counts.get(s.medicineId) ?? 0) + 1);
  }
  const medIds = Array.from(counts.keys());
  const meds = medIds.length
    ? await prisma.medicine.findMany({
        where: { id: { in: medIds } },
        select: {
          id: true,
          name: true,
          brandName: true,
          category: true,
          dosageForm: true,
          manufacturer: true,
          saltComposition: true,
          prescriptionRequired: true,
          isCatalog: true,
          hasInStock: true,
        },
      })
    : [];

  const tally = <K extends string | null | undefined>(key: (m: any) => K) => {
    const t = new Map<string, number>();
    for (const m of meds) {
      const k = (key(m) ?? "Unknown") as string;
      t.set(k, (t.get(k) ?? 0) + (counts.get(m.id) ?? 0));
    }
    return Array.from(t.entries())
      .map(([k, v]) => ({ key: k, count: v }))
      .sort((a, b) => b.count - a.count);
  };

  const topMedicines = meds
    .map((m) => ({
      id: m.id,
      name: m.brandName ?? m.name,
      count: counts.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const totalSearches = searches.length;
  let rxCount = 0;
  let catalogOnly = 0;
  let oosCount = 0;
  for (const m of meds) {
    const c = counts.get(m.id) ?? 0;
    if (m.prescriptionRequired) rxCount += c;
    if (m.isCatalog) catalogOnly += c;
    if (!m.hasInStock) oosCount += c;
  }

  return {
    totalSearches,
    topMedicines,
    categories: tally((m) => m.category).slice(0, 15),
    dosageForms: tally((m) => m.dosageForm).slice(0, 15),
    manufacturers: tally((m) => m.manufacturer).slice(0, 20),
    salts: tally((m) => m.saltComposition).slice(0, 20),
    rxRate: pct(rxCount, totalSearches),
    catalogOnlyRate: pct(catalogOnly, totalSearches),
    oosRate: pct(oosCount, totalSearches),
  };
}

export async function searchBehaviorPanel(w: Window) {
  const since = windowToDate(w);

  const [logs, inputMethods, totalCount, zeroResultRows] = await Promise.all([
    prisma.searchLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        sid: true,
        autocompletePicked: true,
        resultsCount: true,
        latencyMs: true,
        janAushadhiMatch: true,
        refinedFromId: true,
        query: true,
        medicineId: true,
        createdAt: true,
      },
    }),
    prisma.searchLog.groupBy({
      by: ["inputMethod"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.searchLog.count({ where: { createdAt: { gte: since } } }),
    prisma.searchLog.groupBy({
      by: ["query"],
      where: {
        createdAt: { gte: since },
        OR: [{ resultsCount: 0 }, { medicineId: null }],
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 30,
    }),
  ]);

  const autocomplete = logs.filter((l) => l.autocompletePicked).length;
  const zeroResults = logs.filter((l) => (l.resultsCount ?? 0) === 0).length;
  const refined = logs.filter((l) => l.refinedFromId !== null).length;
  const jaMatched = logs.filter((l) => l.janAushadhiMatch).length;

  const sorted = logs
    .map((l) => l.latencyMs)
    .filter((m): m is number => typeof m === "number" && m > 0)
    .sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : null;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null;
  const resultsSorted = logs
    .map((l) => l.resultsCount)
    .filter((m): m is number => typeof m === "number")
    .sort((a, b) => a - b);
  const medianResults = resultsSorted.length
    ? resultsSorted[Math.floor(resultsSorted.length * 0.5)]
    : 0;

  // Multi-medicine sessions
  const distinctMedBySid = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!l.sid || !l.medicineId) continue;
    if (!distinctMedBySid.has(l.sid)) distinctMedBySid.set(l.sid, new Set());
    distinctMedBySid.get(l.sid)!.add(l.medicineId);
  }
  const multiBuckets = { "1": 0, "2-3": 0, "4+": 0 };
  for (const set of distinctMedBySid.values()) {
    if (set.size === 1) multiBuckets["1"]++;
    else if (set.size <= 3) multiBuckets["2-3"]++;
    else multiBuckets["4+"]++;
  }

  return {
    total: totalCount,
    inputMethods: inputMethods.map((r) => ({
      method: r.inputMethod,
      count: r._count.id,
    })),
    autocompletePickedRate: pct(autocomplete, totalCount),
    zeroResultRate: pct(zeroResults, totalCount),
    refinedRate: pct(refined, totalCount),
    jaMatchRate: pct(jaMatched, totalCount),
    medianResults,
    latencyMsP50: p50,
    latencyMsP95: p95,
    zeroResultQueries: zeroResultRows.map((r) => ({
      query: r.query,
      count: r._count.id,
    })),
    multiMedicineSessions: multiBuckets,
    multiMedicineTotalSessions: distinctMedBySid.size,
  };
}

export async function clickConversionPanel(w: Window) {
  const since = windowToDate(w);

  const [searchLogs, clickLogs, pharmacyRows, jaClickCount] = await Promise.all([
    prisma.searchLog.findMany({
      where: { createdAt: { gte: since }, sid: { not: null } },
      select: { id: true, sid: true, medicineId: true, createdAt: true },
    }),
    prisma.clickLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        sid: true,
        searchLogId: true,
        pharmacyName: true,
        medicineId: true,
        position: true,
        sellingPriceAtClick: true,
        mrpAtClick: true,
        isCheapestShown: true,
        isJanAushadhi: true,
        createdAt: true,
      },
    }),
    prisma.clickLog.groupBy({
      by: ["pharmacyName"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.clickLog.count({
      where: { createdAt: { gte: since }, isJanAushadhi: true },
    }),
  ]);

  // Per-session click bucketing
  const clicksBySid = new Map<string, typeof clickLogs>();
  for (const c of clickLogs) {
    if (!c.sid) continue;
    if (!clicksBySid.has(c.sid)) clicksBySid.set(c.sid, []);
    clicksBySid.get(c.sid)!.push(c);
  }

  const sidsWithSearch = new Set(
    searchLogs.map((s) => s.sid).filter(Boolean) as string[]
  );
  const sidsWithSearchAndClicks = new Set<string>();
  for (const sid of sidsWithSearch) {
    if (clicksBySid.has(sid)) sidsWithSearchAndClicks.add(sid);
  }

  const buckets = { "0": 0, "1": 0, "2-4": 0, "5+": 0 };
  for (const sid of sidsWithSearch) {
    const n = clicksBySid.get(sid)?.length ?? 0;
    if (n === 0) buckets["0"]++;
    else if (n === 1) buckets["1"]++;
    else if (n <= 4) buckets["2-4"]++;
    else buckets["5+"]++;
  }

  // Cross-pharmacy: sessions where >=2 distinct pharmacies were clicked for the same medicine
  const crossPharmacySids = new Set<string>();
  for (const [sid, clicks] of clicksBySid.entries()) {
    const byMed = new Map<string, Set<string>>();
    for (const c of clicks) {
      if (!byMed.has(c.medicineId)) byMed.set(c.medicineId, new Set());
      byMed.get(c.medicineId)!.add(c.pharmacyName);
    }
    for (const set of byMed.values()) {
      if (set.size >= 2) {
        crossPharmacySids.add(sid);
        break;
      }
    }
  }

  // Time-to-first-click latency
  const slById = new Map(searchLogs.map((s) => [s.id, s] as const));
  const ttfcMs: number[] = [];
  for (const c of clickLogs) {
    if (!c.searchLogId) continue;
    const sl = slById.get(c.searchLogId);
    if (!sl) continue;
    const dt = c.createdAt.getTime() - sl.createdAt.getTime();
    if (dt >= 0 && dt < 30 * 60_000) ttfcMs.push(dt);
  }
  ttfcMs.sort((a, b) => a - b);
  const ttfcP50 = ttfcMs.length ? ttfcMs[Math.floor(ttfcMs.length * 0.5)] : null;
  const ttfcP95 = ttfcMs.length ? ttfcMs[Math.floor(ttfcMs.length * 0.95)] : null;

  // Position histogram
  const posBuckets = { "1": 0, "2": 0, "3": 0, "4+": 0 };
  for (const c of clickLogs) {
    if (c.position == null) continue;
    if (c.position === 1) posBuckets["1"]++;
    else if (c.position === 2) posBuckets["2"]++;
    else if (c.position === 3) posBuckets["3"]++;
    else posBuckets["4+"]++;
  }

  // Savings — sum of (mrp - sellingPriceAtClick)
  let savings = 0;
  for (const c of clickLogs) {
    if (c.mrpAtClick != null && c.sellingPriceAtClick != null && c.mrpAtClick > c.sellingPriceAtClick) {
      savings += c.mrpAtClick - c.sellingPriceAtClick;
    }
  }

  const cheapestClicks = clickLogs.filter((c) => c.isCheapestShown).length;

  return {
    totalClicks: clickLogs.length,
    sessionsWithSearch: sidsWithSearch.size,
    clickThroughSessions: sidsWithSearchAndClicks.size,
    sessionClickBuckets: buckets,
    crossPharmacyRate: pct(crossPharmacySids.size, sidsWithSearch.size),
    crossPharmacySessions: crossPharmacySids.size,
    pharmacyLeaderboard: pharmacyRows.map((r) => ({
      pharmacy: r.pharmacyName,
      clicks: r._count.id,
    })),
    cheapestShownCTR: pct(cheapestClicks, clickLogs.length),
    jaClickCount,
    positionHistogram: posBuckets,
    ttfcMsP50: ttfcP50,
    ttfcMsP95: ttfcP95,
    estimatedSavingsRupees: Math.round(savings),
  };
}

export async function uploadPanel(w: Window) {
  const since = windowToDate(w);
  const [uploads, sessions] = await Promise.all([
    prisma.ocrUpload.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        sid: true,
        succeeded: true,
        medsExtracted: true,
        latencyMs: true,
        mimeType: true,
        fileSizeBytes: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    prisma.session.count({ where: { lastSeenAt: { gte: since } } }),
  ]);

  const total = uploads.length;
  const succeeded = uploads.filter((u) => u.succeeded).length;
  const uniqueSids = new Set(uploads.map((u) => u.sid).filter(Boolean) as string[]);

  const medsBuckets = { "0": 0, "1": 0, "2-3": 0, "4-6": 0, "7+": 0 };
  for (const u of uploads) {
    const n = u.medsExtracted;
    if (n === 0) medsBuckets["0"]++;
    else if (n === 1) medsBuckets["1"]++;
    else if (n <= 3) medsBuckets["2-3"]++;
    else if (n <= 6) medsBuckets["4-6"]++;
    else medsBuckets["7+"]++;
  }

  const latencies = uploads
    .map((u) => u.latencyMs)
    .filter((m): m is number => typeof m === "number" && m > 0)
    .sort((a, b) => a - b);
  const latencyP50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null;
  const latencyP95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null;

  const mimeRows = new Map<string, number>();
  for (const u of uploads) {
    const m = u.mimeType ?? "unknown";
    mimeRows.set(m, (mimeRows.get(m) ?? 0) + 1);
  }

  const recentErrors = uploads
    .filter((u) => u.errorMessage)
    .slice(-10)
    .map((u) => ({ ts: u.createdAt, error: u.errorMessage }));

  return {
    total,
    uniqueUsers: uniqueSids.size,
    adoptionRate: pct(uniqueSids.size, sessions),
    successRate: pct(succeeded, total),
    medsExtracted: medsBuckets,
    latencyMsP50: latencyP50,
    latencyMsP95: latencyP95,
    mimeTypes: Array.from(mimeRows.entries()).map(([mime, count]) => ({ mime, count })),
    recentErrors,
  };
}

export async function janAushadhiPanel(w: Window) {
  const since = windowToDate(w);

  const [
    matched,
    notMatched,
    jaClicks,
    nonJaClicks,
    locatorEvents,
    confidenceRows,
    storeStateRows,
    totalMappings,
    totalNonCatalog,
  ] = await Promise.all([
    prisma.searchLog.count({
      where: { createdAt: { gte: since }, janAushadhiMatch: true },
    }),
    prisma.searchLog.count({
      where: { createdAt: { gte: since }, janAushadhiMatch: false },
    }),
    prisma.clickLog.count({
      where: { createdAt: { gte: since }, isJanAushadhi: true },
    }),
    prisma.clickLog.count({
      where: { createdAt: { gte: since }, isJanAushadhi: false },
    }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: since }, path: { startsWith: "locator:" } },
      select: { sid: true, path: true, meta: true, createdAt: true },
    }),
    prisma.saltMapping.groupBy({
      by: ["matchConfidence"],
      _count: { id: true },
    }),
    prisma.janAushadhiStore.groupBy({
      by: ["state"],
      where: { state: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 36,
    }),
    prisma.saltMapping.count(),
    prisma.medicine.count({ where: { isCatalog: false } }),
  ]);

  const totalSearches = matched + notMatched;

  const locatorSessions = new Set(locatorEvents.map((e) => e.sid)).size;
  const geoRequests = locatorEvents.filter((e) => e.path === "locator:geo_request").length;
  const geoResults = locatorEvents.filter((e) => e.path === "locator:geo_results").length;
  const geoDenied = locatorEvents.filter((e) => e.path === "locator:geo_denied").length;
  const searches = locatorEvents.filter((e) => e.path === "locator:search").length;

  const nearestBuckets = { "<2km": 0, "2-5km": 0, "5-10km": 0, ">10km": 0 };
  for (const e of locatorEvents) {
    if (e.path !== "locator:geo_results" || !e.meta) continue;
    try {
      const m = JSON.parse(e.meta);
      const km = m.nearestKm;
      if (typeof km !== "number") continue;
      if (km < 2) nearestBuckets["<2km"]++;
      else if (km < 5) nearestBuckets["2-5km"]++;
      else if (km < 10) nearestBuckets["5-10km"]++;
      else nearestBuckets[">10km"]++;
    } catch {}
  }

  return {
    matchOfferRate: pct(matched, totalSearches),
    matched,
    notMatched,
    jaClicks,
    nonJaClicks,
    jaClickShare: pct(jaClicks, jaClicks + nonJaClicks),
    confidence: confidenceRows.map((r) => ({
      confidence: r.matchConfidence,
      count: r._count.id,
    })),
    locator: {
      sessions: locatorSessions,
      searches,
      geoRequests,
      geoResults,
      geoDenied,
      geoGrantRate: pct(geoResults, geoRequests),
      nearestBuckets,
    },
    coverage: {
      mapped: totalMappings,
      totalNonCatalog,
      coverageRate: pct(totalMappings, totalNonCatalog),
    },
    storesByState: storeStateRows.map((r) => ({
      state: r.state ?? "unknown",
      kendras: r._count.id,
    })),
  };
}

export async function pricingPanel(w: Window) {
  const since = windowToDate(w);

  const listings = await prisma.pharmacyListing.findMany({
    where: { scrapedAt: { gte: since } },
    select: {
      medicineId: true,
      pharmacyName: true,
      sellingPrice: true,
      mrp: true,
      discountPercent: true,
    },
  });

  // Per-medicine spreads
  const byMed = new Map<string, { min: number; max: number; pharmacies: Set<string> }>();
  for (const l of listings) {
    const p = l.sellingPrice ?? l.mrp;
    if (p == null) continue;
    const cur = byMed.get(l.medicineId);
    if (!cur) {
      byMed.set(l.medicineId, {
        min: p,
        max: p,
        pharmacies: new Set([l.pharmacyName]),
      });
    } else {
      cur.min = Math.min(cur.min, p);
      cur.max = Math.max(cur.max, p);
      cur.pharmacies.add(l.pharmacyName);
    }
  }
  const spreadRows = Array.from(byMed.entries())
    .filter(([, v]) => v.pharmacies.size >= 2)
    .map(([medId, v]) => ({
      medicineId: medId,
      spread: v.max - v.min,
      min: v.min,
      max: v.max,
      pharmacies: v.pharmacies.size,
    }))
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 20);

  const medIds = spreadRows.map((s) => s.medicineId);
  const meds = medIds.length
    ? await prisma.medicine.findMany({
        where: { id: { in: medIds } },
        select: { id: true, name: true, brandName: true },
      })
    : [];
  const nameById = new Map(meds.map((m) => [m.id, m.brandName ?? m.name]));
  const topSpreads = spreadRows.map((s) => ({
    name: nameById.get(s.medicineId) ?? "Unknown",
    spread: Math.round(s.spread * 100) / 100,
    min: Math.round(s.min * 100) / 100,
    max: Math.round(s.max * 100) / 100,
    pharmacies: s.pharmacies,
  }));

  // Cheapest-wins per pharmacy
  const cheapestPerMed = new Map<string, string>();
  for (const [medId, v] of byMed.entries()) {
    if (v.pharmacies.size < 2) continue;
    const cheapest = listings
      .filter((l) => l.medicineId === medId)
      .reduce((best: typeof listings[number] | null, l) => {
        const p = l.sellingPrice ?? l.mrp;
        if (p == null) return best;
        if (!best) return l;
        const bp = best.sellingPrice ?? best.mrp ?? Infinity;
        return p < bp ? l : best;
      }, null);
    if (cheapest) cheapestPerMed.set(medId, cheapest.pharmacyName);
  }
  const cheapestWins = new Map<string, number>();
  for (const ph of cheapestPerMed.values()) {
    cheapestWins.set(ph, (cheapestWins.get(ph) ?? 0) + 1);
  }

  // Discount distribution
  const discBuckets = { "0-10%": 0, "10-25%": 0, "25-50%": 0, "50%+": 0 };
  for (const l of listings) {
    const d = l.discountPercent;
    if (d == null) continue;
    if (d < 10) discBuckets["0-10%"]++;
    else if (d < 25) discBuckets["10-25%"]++;
    else if (d < 50) discBuckets["25-50%"]++;
    else discBuckets["50%+"]++;
  }

  return {
    topSpreads,
    cheapestWins: Array.from(cheapestWins.entries())
      .map(([pharmacy, count]) => ({ pharmacy, count }))
      .sort((a, b) => b.count - a.count),
    discountDistribution: discBuckets,
    totalListings: listings.length,
  };
}

export async function opsPanel(w: Window) {
  const since = windowToDate(w);

  const [scrapeByStatus, scrapeByPharmacy, apiByStatus, apiByRoute, recentErrors] = await Promise.all([
    prisma.scrapeJob.groupBy({
      by: ["status"],
      where: { startedAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.scrapeJob.groupBy({
      by: ["pharmacy", "status"],
      where: { startedAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.apiLog.groupBy({
      by: ["statusCode"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.$queryRaw<{ route: string; p50: number; p95: number; count: bigint }[]>`
      SELECT
        "route",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::int AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::int AS p95,
        count(*) AS count
      FROM "ApiLog"
      WHERE "createdAt" >= ${since}
      GROUP BY "route"
      ORDER BY count DESC
      LIMIT 20
    `.catch(() => []),
    prisma.scrapeJob.findMany({
      where: { startedAt: { gte: since }, status: "failed" },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { pharmacy: true, errorMessage: true, startedAt: true },
    }),
  ]);

  const byPharmacyAgg = new Map<string, { ok: number; failed: number; running: number }>();
  for (const r of scrapeByPharmacy) {
    if (!byPharmacyAgg.has(r.pharmacy))
      byPharmacyAgg.set(r.pharmacy, { ok: 0, failed: 0, running: 0 });
    const a = byPharmacyAgg.get(r.pharmacy)!;
    if (r.status === "success") a.ok += r._count.id;
    else if (r.status === "failed") a.failed += r._count.id;
    else a.running += r._count.id;
  }

  return {
    scrapeStatus: scrapeByStatus.map((r) => ({ status: r.status, count: r._count.id })),
    scrapeByPharmacy: Array.from(byPharmacyAgg.entries()).map(([pharmacy, counts]) => ({
      pharmacy,
      ...counts,
      successRate: pct(counts.ok, counts.ok + counts.failed),
    })),
    apiStatus: apiByStatus.map((r) => ({
      statusCode: r.statusCode,
      count: r._count.id,
    })),
    routeLatency: apiByRoute.map((r) => ({
      route: r.route,
      p50: r.p50,
      p95: r.p95,
      count: Number(r.count),
    })),
    recentScrapeFailures: recentErrors,
  };
}

export async function funnelPanel(w: Window) {
  const since = windowToDate(w);
  const [allSessions, searchSids, clickSids] = await Promise.all([
    prisma.session.findMany({
      where: { lastSeenAt: { gte: since } },
      select: { sid: true },
    }),
    prisma.searchLog.findMany({
      where: { createdAt: { gte: since }, sid: { not: null } },
      select: { sid: true, resultsCount: true },
    }),
    prisma.clickLog.findMany({
      where: { createdAt: { gte: since }, sid: { not: null } },
      select: { sid: true },
    }),
  ]);

  const landedSids = new Set(allSessions.map((s) => s.sid));
  const searchedSids = new Set<string>();
  const gotResultsSids = new Set<string>();
  for (const s of searchSids) {
    if (!s.sid) continue;
    searchedSids.add(s.sid);
    if ((s.resultsCount ?? 0) > 0) gotResultsSids.add(s.sid);
  }
  const clickedSids = new Set(clickSids.map((c) => c.sid).filter(Boolean) as string[]);

  return {
    landed: landedSids.size,
    searched: searchedSids.size,
    gotResults: gotResultsSids.size,
    clicked: clickedSids.size,
  };
}
