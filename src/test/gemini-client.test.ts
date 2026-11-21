import { describe, expect, it } from "vitest";
import { extractWithGemini } from "@/lib/gemini/client";
import demoPrescription from "../../fixtures/gemini/prescription-1.json";

function makeResponse(options: { status: number; body?: unknown; blockReason?: string; finishReason?: string; text?: string }): Response {
  let textBody = "";
  if (options.body) {
    textBody = JSON.stringify(options.body);
  } else if (options.text) {
    textBody = options.text;
  } else {
    const parts: Array<{ text?: string }> = [];
    if (options.finishReason) {
      parts.push({});
    } else {
      parts.push({ text: JSON.stringify(demoPrescription) });
    }
    textBody = JSON.stringify({
      promptFeedback: options.blockReason ? { blockReason: options.blockReason } : undefined,
      candidates: parts.length ? [{ finishReason: options.finishReason, content: { parts } }] : undefined,
    });
  }
  return new Response(textBody, { status: options.status });
}

describe("gemini-client", () => {
  it("FR-5.1 returns ok with 3 medicines from fixture JSON", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(init!.headers).toHaveProperty("x-goog-api-key");
      expect(String(url)).toContain("gemini-1.5-flash");
      const body = JSON.parse(init!.body as string);
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      return makeResponse({ status: 200 });
    };
    const result = await extractWithGemini({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
      apiKey: "test-key",
      model: "gemini-1.5-flash",
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extraction.medicines).toHaveLength(3);
    }
  });

  it("status 429 returns AI_UNAVAILABLE", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => makeResponse({ status: 429 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_UNAVAILABLE");
    }
  });

  it("status 404 returns AI_NOT_CONFIGURED", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => makeResponse({ status: 404 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_NOT_CONFIGURED");
    }
  });

  it("status 403 returns AI_NOT_CONFIGURED", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => makeResponse({ status: 403 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_NOT_CONFIGURED");
    }
  });

  it("promptFeedback.blockReason: SAFETY returns AI_BLOCKED", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => makeResponse({ status: 200, blockReason: "SAFETY" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_BLOCKED");
    }
  });

  it("finishReason: SAFETY returns AI_BLOCKED", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => makeResponse({ status: 200, finishReason: "SAFETY" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_BLOCKED");
    }
  });

  it("text 'not json' returns AI_INVALID_OUTPUT with raw.text", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => new Response("not json", { status: 200 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_INVALID_OUTPUT");
      expect(result.raw).toBeDefined();
      if (result.raw && "text" in result.raw) {
        expect((result.raw as { text: string }).text).toBe("not json");
      }
    }
  });

  it("valid JSON that fails schema returns AI_INVALID_OUTPUT", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => new Response(JSON.stringify({ medicines: "not-an-array" }), { status: 200 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_INVALID_OUTPUT");
    }
  });

  it("fetchImpl rejecting with AbortError returns AI_UNAVAILABLE", async () => {
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      fetchImpl: async () => {
        throw new Error("AbortError", { cause: { name: "AbortError" } });
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_UNAVAILABLE");
    }
  });

  it("timeoutMs: 10 with abort signal returns AI_UNAVAILABLE within one second", async () => {
    const start = Date.now();
    const result = await extractWithGemini({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      apiKey: "key",
      model: "gemini-1.5-flash",
      timeoutMs: 10,
      fetchImpl: async (_url, init) => {
        if (init!.signal!.aborted) {
          throw new Error("Aborted", { cause: { name: "AbortError" } });
        }
        await new Promise<void>((resolve, reject) => {
          const handler = () => reject(new Error("Aborted", { cause: { name: "AbortError" } }));
          init!.signal!.addEventListener("abort", handler, { once: true });
        });
        return new Response("{}", { status: 200 });
      },
    });
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_UNAVAILABLE");
    }
    expect(elapsed).toBeLessThan(1000);
  });
});
