import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeAll, scrapeOne } from "@/lib/scrapers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-admin-password");
  if (auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, pharmacy } = await req.json().catch(() => ({}));
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const job = await prisma.scrapeJob.create({
    data: { pharmacy: pharmacy ?? "all", status: "running" },
  });

  try {
    const results =
      pharmacy && pharmacy !== "all"
        ? await scrapeOne(pharmacy, query)
        : await scrapeAll(query);

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "success",
        completedAt: new Date(),
        medicinesScraped: results.length,
      },
    });

    return NextResponse.json({ jobId: job.id, count: results.length, results });
  } catch (err: any) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err.message ?? String(err),
      },
    });
    return NextResponse.json(
      { error: err.message ?? "Scrape failed", jobId: job.id },
      { status: 500 }
    );
  }
}
