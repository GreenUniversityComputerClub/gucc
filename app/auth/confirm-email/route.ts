import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { rpc } from "@/lib/api/session";

/** Link from the "confirm your new sign-in email" message: /auth/confirm-email?token=… */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) redirect("/auth/error?error=missing-token");
  const r = await rpc<{ email: string }>("auth.confirmEmailChange", { token });
  if (!r.ok) redirect(`/auth/error?error=${r.code === "TOKEN_INVALID" ? "email-change" : encodeURIComponent(r.code)}`);
  // Every session was signed out: sign in again with the new address.
  redirect("/auth/login?email-changed=1");
}
