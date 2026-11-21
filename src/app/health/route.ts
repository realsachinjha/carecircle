import { jsonOk } from "@/lib/api";

export function GET() {
  return jsonOk({ ok: true });
}
