import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/admin-auth";
import {
  trafficPanel,
  geographyPanel,
  medicineTaxonomyPanel,
  searchBehaviorPanel,
  clickConversionPanel,
  uploadPanel,
  janAushadhiPanel,
  pricingPanel,
  opsPanel,
  funnelPanel,
  type Window,
} from "@/lib/analytics/aggregations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PANELS = {
  traffic: trafficPanel,
  geography: geographyPanel,
  medicines: medicineTaxonomyPanel,
  search: searchBehaviorPanel,
  clicks: clickConversionPanel,
  uploads: uploadPanel,
  jaushadhi: janAushadhiPanel,
  pricing: pricingPanel,
  ops: opsPanel,
  funnel: funnelPanel,
} as const;

type PanelKey = keyof typeof PANELS;
const VALID_WINDOWS: Window[] = ["1h", "24h", "7d", "30d", "all"];

export async function GET(req: NextRequest) {
  const denied = checkAdmin(req);
  if (denied) return denied;

  const panel = (req.nextUrl.searchParams.get("panel") ?? "") as PanelKey;
  const windowParam = (req.nextUrl.searchParams.get("window") ?? "24h") as Window;
  const window: Window = VALID_WINDOWS.includes(windowParam) ? windowParam : "24h";

  if (!(panel in PANELS)) {
    return NextResponse.json(
      { error: `Unknown panel. Use one of: ${Object.keys(PANELS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const data = await PANELS[panel](window);
    return NextResponse.json({ panel, window, data });
  } catch (err: any) {
    console.error(`[metrics:${panel}]`, err);
    return NextResponse.json(
      { error: err?.message ?? "Aggregation failed" },
      { status: 500 }
    );
  }
}
