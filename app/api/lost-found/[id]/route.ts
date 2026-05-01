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

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const supabase = createClient(req);
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = context.params;
  const body = await req.json();
  const { status } = body as { status: LostFoundStatus };

  if (!status) {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }

  const { data: post, error: postError } = await supabase
    .from("lost_found_posts")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const isOwner = post.user_id === authData.user.id;

  if (!isOwner && !isAdmin(authData.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  const supabase = createClient(req);
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = context.params;
  const { data: post, error: postError } = await supabase
    .from("lost_found_posts")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const isOwner = post.user_id === authData.user.id;

  if (!isOwner && !isAdmin(authData.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("lost_found_posts").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
