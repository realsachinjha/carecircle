import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { logFailure, logRequest } from "./log";
import { strings } from "@/strings/en";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function jsonError(error: unknown, requestId: string) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId } },
      { status: error.status, headers: NO_STORE },
    );
  }
  logFailure(requestId, "INTERNAL");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: strings.errors.INTERNAL, requestId } },
    { status: 500, headers: NO_STORE },
  );
}

type Handler<P> = (request: Request, context: { params: P; requestId: string }) => Promise<Response>;

export function handleRoute<P extends Record<string, string> = Record<string, never>>(handler: Handler<P>) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let response: Response;
    try {
      const params = await context.params;
      response = await handler(request, { params, requestId });
    } catch (error) {
      response = jsonError(error, requestId);
    }
    logRequest({
      requestId,
      method: request.method,
      route: new URL(request.url).pathname,
      status: response.status,
      durationMs: Date.now() - started,
    });
    return response;
  };
}
