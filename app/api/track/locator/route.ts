import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sid: string | null = typeof body?.sid === "string" ? body.sid.slice(0, 64) : null;
  if (!sid) return NextResponse.json({ ok: false }, { status: 400 });

  const action: string = typeof body?.action === "string" ? body.action.slice(0, 64) : "unknown";
  const meta = body?.meta ? JSON.stringify(body.meta).slice(0, 1024) : null;

  await prisma.pageView
    .create({
      data: { sid, path: `locator:${action}`, meta },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
