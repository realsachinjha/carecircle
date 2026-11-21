import { isErrorCode, type ErrorCode } from "@/lib/errors";

export type ApiFailure = { code: ErrorCode | "OFFLINE"; requestId?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export async function callApi<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, data: payload as T };
  }
  const error = (payload as { error?: { code?: unknown; requestId?: unknown } } | null)?.error;
  return {
    ok: false,
    error: {
      code: isErrorCode(error?.code) ? error.code : "INTERNAL",
      requestId: typeof error?.requestId === "string" ? error.requestId : undefined,
    },
  };
}
