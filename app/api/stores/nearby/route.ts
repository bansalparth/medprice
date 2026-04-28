import { NextRequest, NextResponse } from "next/server";
import { findNearestStores } from "@/lib/jan-aushadhi/geo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const stores = await findNearestStores(lat, lng, limit);
  return NextResponse.json({ stores });
}
