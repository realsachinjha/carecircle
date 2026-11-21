type RequestLog = {
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
};

export function logRequest(entry: RequestLog) {
  console.log(JSON.stringify({ level: "info", type: "request", ...entry }));
}

export function logFailure(requestId: string, code: string) {
  console.error(JSON.stringify({ level: "error", type: "failure", requestId, code }));
}
