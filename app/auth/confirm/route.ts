import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { rpc } from "@/lib/api/session";

/** Email verification link target: /auth/confirm?token=… */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) redirect("/auth/error?error=missing-token");
  const r = await rpc<{ status: string }>("auth.verifyEmail", { token });
  if (!r.ok) redirect(`/auth/error?error=${encodeURIComponent(r.code)}`);
  redirect(r.data.status === "ACTIVE" ? "/auth/login?verified=1" : "/auth/login?verified=pending");
}
