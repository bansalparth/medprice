import { NextRequest, NextResponse } from "next/server";
import { extractMedicinesFromImage } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";
import { readSid } from "@/lib/tracking";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const sid = readSid(req);
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  const log = (data: {
    succeeded: boolean;
    medsExtracted: number;
    errorMessage?: string | null;
  }) => {
    prisma.ocrUpload
      .create({
        data: {
          sid: sid ?? null,
          fileSizeBytes: fileSize,
          mimeType,
          medsExtracted: data.medsExtracted,
          succeeded: data.succeeded,
          latencyMs: Date.now() - t0,
          errorMessage: data.errorMessage ?? null,
        },
      })
      .catch(() => null);
  };

  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      log({ succeeded: false, medsExtracted: 0, errorMessage: "no_image" });
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    fileSize = file.size;
    mimeType = file.type || null;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const mime =
      file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";

    const result = await extractMedicinesFromImage(buffer, mime as any);
    const meds = Array.isArray(result?.medicines) ? result.medicines.length : 0;
    log({ succeeded: meds > 0, medsExtracted: meds });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[ocr-route]", err);
    log({
      succeeded: false,
      medsExtracted: 0,
      errorMessage: (err?.message ?? "OCR failed").slice(0, 500),
    });
    return NextResponse.json(
      { error: err?.message ?? "OCR failed", medicines: [], confidence: "low" },
      { status: 500 }
    );
  }
}
