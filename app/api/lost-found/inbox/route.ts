import { forward } from "@/lib/api/route";

export const dynamic = "force-dynamic";

type Row = { id: string; body: string; created_at: string; sender_email: string; post_id: string; post_title: string };

export async function GET(req: Request) {
  return forward(req, "lostfound.inbox", {}, {
    shape: (rows) => (rows as Row[]).map((r) => ({ id: r.id, body: r.body, created_at: r.created_at, sender_email: r.sender_email, post: { id: r.post_id, title: r.post_title } })),
  });
}
