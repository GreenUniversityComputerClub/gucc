import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { allowedStudentDomains } from "@/lib/lost-found/config";

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

function isAllowedStudentEmail(email: string | undefined | null) {
  if (!email) return false;
  return allowedStudentDomains.some((domain) => email.toLowerCase().endsWith(domain));
}

export async function POST(req: NextRequest) {
  const supabase = createClient(req);
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAllowedStudentEmail(authData.user.email)) {
    return NextResponse.json(
      { error: "Only university email accounts can message." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { postId, message } = body as { postId: string; message: string };

  if (!postId || !message) {
    return NextResponse.json({ error: "Missing postId or message" }, { status: 400 });
  }

  const { data: post, error: postError } = await supabase
    .from("lost_found_posts")
    .select("id, contact_method, status")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "active") {
    return NextResponse.json({ error: "This post is not active" }, { status: 400 });
  }

  if (post.contact_method !== "in_app") {
    return NextResponse.json({ error: "This post does not accept in-app messages" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lost_found_messages")
    .insert({
      post_id: postId,
      sender_id: authData.user.id,
      sender_email: authData.user.email,
      body: message,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
