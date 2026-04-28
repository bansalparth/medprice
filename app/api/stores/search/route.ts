import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state")?.trim();
  const district = req.nextUrl.searchParams.get("district")?.trim();

  const stores = await prisma.janAushadhiStore.findMany({
    where: {
      ...(state ? { state: { contains: state } } : {}),
      ...(district ? { district: { contains: district } } : {}),
    },
    take: 100,
  });

  return NextResponse.json({ stores });
}
