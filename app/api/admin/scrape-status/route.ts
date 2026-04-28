import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("x-admin-password");
  if (auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [jobs, topSearches, totalMedicines, totalListings, totalStores] =
    await Promise.all([
      prisma.scrapeJob.findMany({ orderBy: { startedAt: "desc" }, take: 50 }),
      prisma.searchLog.groupBy({
        by: ["query"],
        _count: { query: true },
        orderBy: { _count: { query: "desc" } },
        take: 20,
      }),
      prisma.medicine.count(),
      prisma.pharmacyListing.count(),
      prisma.janAushadhiStore.count(),
    ]);

  return NextResponse.json({
    jobs,
    topSearches,
    stats: { totalMedicines, totalListings, totalStores },
  });
}
