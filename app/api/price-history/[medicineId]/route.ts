import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { medicineId: string } }
) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const points = await prisma.priceHistory.findMany({
    where: { medicineId: params.medicineId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: {
      pharmacyName: true,
      sellingPrice: true,
      mrp: true,
      recordedAt: true,
    },
  });

  // Group by pharmacy
  const grouped: Record<
    string,
    { recordedAt: string; sellingPrice: number | null; mrp: number | null }[]
  > = {};
  for (const p of points) {
    if (!grouped[p.pharmacyName]) grouped[p.pharmacyName] = [];
    grouped[p.pharmacyName].push({
      recordedAt: p.recordedAt.toISOString(),
      sellingPrice: p.sellingPrice,
      mrp: p.mrp,
    });
  }

  return NextResponse.json({ series: grouped });
}
