import { NextRequest, NextResponse } from "next/server";
import { extractMedicinesFromImage } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const mime =
      file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";

    const result = await extractMedicinesFromImage(buffer, mime as any);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[ocr-route]", err);
    return NextResponse.json(
      { error: err?.message ?? "OCR failed", medicines: [], confidence: "low" },
      { status: 500 }
    );
  }
}
