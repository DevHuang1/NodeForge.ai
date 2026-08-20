import { listAuditEvents } from "@/lib/persistence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const events = await listAuditEvents(limit);
  return Response.json({ events });
}