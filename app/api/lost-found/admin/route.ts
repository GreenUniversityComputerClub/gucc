import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { adminEmails } from "@/lib/lost-found/config";
import type { LostFoundStatus } from "@/lib/lost-found/types";

export const dynamic = "force-dynamic";

function createClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
      },
    }
  );
}

function isAdmin(email: string | undefined | null) {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient(req);
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(authData.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, status } = body as { id: string; status: LostFoundStatus };

  if (!id || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lost_found_posts")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
