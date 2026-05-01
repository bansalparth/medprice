import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `You are a medical prescription parser. Extract all medicine/drug names from this prescription image.

Return ONLY valid JSON in this exact format with no markdown, no explanation, no preamble:
{"medicines":["MedicineName1","MedicineName2"],"confidence":"high"}

Rules:
- Extract only medicine/drug names
- Normalize: strip prefixes (Tab, Cap, Syp, Inj) and trailing dosage numbers (e.g. "Tab Crocin 500mg" -> "Crocin", "Metformin 500" -> "Metformin")
- If handwriting is unclear, include your best guess and set confidence to "low"
- Valid confidence values: "high", "medium", "low"
- Return {"medicines":[],"confidence":"low"} if no medicines found
- Never include patient name, doctor name, or personal information`;

export type OcrResult = { medicines: string[]; confidence: "high" | "medium" | "low" };

export async function extractMedicinesFromImage(
  imageBuffer: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<OcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("AIza...")) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const base64 = imageBuffer.toString("base64");
  const parts = [
    SYSTEM_PROMPT,
    { inlineData: { mimeType, data: base64 } },
  ] as const;

  const tryModel = async (name: string) => {
    const model = genAI.getGenerativeModel({ model: name });
    return model.generateContent([...parts]);
  };

  let result;
  try {
    result = await tryModel("gemini-2.5-flash");
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (/503|overloaded|not found|404/i.test(msg)) {
      result = await tryModel("gemini-flash-latest");
    } else {
      throw err;
    }
  }

  const text = (result.response.text() ?? "").trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error("[ocr] Failed to parse Gemini response:", text);
    throw new Error(
      `Could not parse AI response. Raw output: ${text.slice(0, 200)}`
    );
  }
  return {
    medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
    confidence: ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium",
  };
}
