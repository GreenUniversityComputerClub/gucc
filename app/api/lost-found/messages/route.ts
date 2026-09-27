import { forward, readJson } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req);
  return forward(req, "lostfound.message", { postId: body.postId, message: body.message }, { status: 201 });
}
