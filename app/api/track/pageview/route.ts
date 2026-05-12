import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyDevice, classifyReferrer } from "@/lib/tracking";

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

  const path: string = typeof body?.path === "string" ? body.path.slice(0, 512) : "/";
  const referrer: string | null = typeof body?.referrer === "string" ? body.referrer.slice(0, 1024) : null;
  const userAgent: string | null = typeof body?.userAgent === "string" ? body.userAgent.slice(0, 512) : null;
  const loc = body?.location ?? {};

  const deviceClass = classifyDevice(userAgent);
  const referrerClass = classifyReferrer(referrer);

  await Promise.all([
    prisma.pageView
      .create({
        data: { sid, path, referrer: referrer ?? null, meta: referrerClass },
      })
      .catch(() => null),
    prisma.session
      .upsert({
        where: { sid },
        update: {
          lastSeenAt: new Date(),
          pincode: loc.pincode ?? undefined,
          city: loc.city ?? undefined,
          state: loc.state ?? undefined,
          lat: typeof loc.lat === "number" ? loc.lat : undefined,
          lng: typeof loc.lng === "number" ? loc.lng : undefined,
        },
        create: {
          sid,
          userAgent: userAgent ?? null,
          deviceClass,
          referrer: referrer ?? null,
          pincode: loc.pincode ?? null,
          city: loc.city ?? null,
          state: loc.state ?? null,
          lat: typeof loc.lat === "number" ? loc.lat : null,
          lng: typeof loc.lng === "number" ? loc.lng : null,
          locationSource: loc.pincode || loc.city ? "client" : null,
        },
      })
      .catch(() => null),
  ]);

  return NextResponse.json({ ok: true });
}
