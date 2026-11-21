import "server-only";
import demoPrescription from "../../../fixtures/gemini/prescription-1.json";
import { getEnv } from "@/lib/env";
import { extractWithGemini, type ExtractResult } from "./client";
import { extractionSchema } from "./schema";

export async function extractMedicines(bytes: Uint8Array, mimeType: string): Promise<ExtractResult> {
  const env = getEnv();
  if (env.demoMode) {
    return { ok: true, extraction: extractionSchema.parse(demoPrescription) };
  }
  if (!env.geminiApiKey || !env.geminiModel) {
    return { ok: false, code: "AI_NOT_CONFIGURED", raw: null };
  }
  return extractWithGemini({ bytes, mimeType, apiKey: env.geminiApiKey, model: env.geminiModel });
}
