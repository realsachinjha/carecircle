import "server-only";
import { EXTRACTION_PROMPT } from "./prompt";
import { GEMINI_RESPONSE_SCHEMA, extractionSchema, type Extraction } from "./schema";

export type ExtractFailureCode = "AI_UNAVAILABLE" | "AI_INVALID_OUTPUT" | "AI_BLOCKED" | "AI_NOT_CONFIGURED";

export type ExtractResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; code: ExtractFailureCode; raw: Record<string, unknown> | null };

type GeminiRequest = {
  bytes: Uint8Array;
  mimeType: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const BLOCKED_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export async function extractWithGemini(request: GeminiRequest): Promise<ExtractResult> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: EXTRACTION_PROMPT },
          { inlineData: { mimeType: request.mimeType, data: Buffer.from(request.bytes).toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  };
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": request.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
    });
  } catch {
    return { ok: false, code: "AI_UNAVAILABLE", raw: null };
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return { ok: false, code: "AI_NOT_CONFIGURED", raw: { status: response.status } };
  }
  if (!response.ok) {
    return { ok: false, code: "AI_UNAVAILABLE", raw: { status: response.status } };
  }
  let payload: GeminiResponse;
  try {
    payload = (await response.json()) as GeminiResponse;
  } catch {
    return { ok: false, code: "AI_INVALID_OUTPUT", raw: null };
  }
  if (payload.promptFeedback?.blockReason) {
    return { ok: false, code: "AI_BLOCKED", raw: { blockReason: payload.promptFeedback.blockReason } };
  }
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason && BLOCKED_FINISH_REASONS.has(candidate.finishReason)) {
    return { ok: false, code: "AI_BLOCKED", raw: { finishReason: candidate.finishReason } };
  }
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "AI_INVALID_OUTPUT", raw: { text: text.slice(0, 20_000) } };
  }
  const validated = extractionSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, code: "AI_INVALID_OUTPUT", raw: { text: text.slice(0, 20_000) } };
  }
  return { ok: true, extraction: validated.data };
}
