import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state")?.trim();
  const district = req.nextUrl.searchParams.get("district")?.trim();
  const pincode = req.nextUrl.searchParams.get("pincode")?.trim();

  const stores = await prisma.janAushadhiStore.findMany({
    where: {
      ...(state ? { state: { contains: state, mode: "insensitive" as const } } : {}),
      ...(district ? { district: { contains: district, mode: "insensitive" as const } } : {}),
      ...(pincode ? { pincode } : {}),
    },
    take: 100,
  });

  return NextResponse.json({ stores });
}
