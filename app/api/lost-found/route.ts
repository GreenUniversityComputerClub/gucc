import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { allowedStudentDomains } from "@/lib/lost-found/config";
import type { ContactMethod, LostFoundStatus, LostFoundType } from "@/lib/lost-found/types";

export const dynamic = "force-dynamic";

function createClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            try {
              req.cookies.set({ name, value, ...options });
            } catch {
              // Route handlers may not always allow mutating request cookies;
              // ignore to preserve current behavior while still exposing the
              // full cookie adapter expected by Supabase SSR.
            }
          }
        },
      },
    }
  );
}

function isAllowedStudentEmail(email: string | undefined | null) {
  if (!email) return false;
  return allowedStudentDomains.some((domain) => email.toLowerCase().endsWith(domain));
}

export async function GET(req: NextRequest) {
  const supabase = createClient(req);
  const { searchParams } = req.nextUrl;

  const status = searchParams.get("status") || "active";
  const type = searchParams.get("type");
  const category = searchParams.get("category");
  const location = searchParams.get("location");
  const q = searchParams.get("q");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  let query = supabase
    .from("lost_found_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status as LostFoundStatus);
  }

  if (type) {
    query = query.eq("type", type as LostFoundType);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (location) {
    query = query.ilike("location", `%${location}%`);
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  if (dateFrom) {
    query = query.gte("occurred_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("occurred_at", dateTo);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = createClient(req);
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAllowedStudentEmail(authData.user.email)) {
    return NextResponse.json(
      { error: "Only university email accounts can create posts." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const {
    type,
    title,
    category,
    description,
    location,
    occurred_at,
    image_url,
    contact_method,
    contact_value,
  } = body as {
    type: LostFoundType;
    title: string;
    category: string;
    description: string;
    location: string;
    occurred_at: string;
    image_url?: string | null;
    contact_method: ContactMethod;
    contact_value?: string | null;
  };

  if (!type || !title || !category || !description || !location || !occurred_at || !contact_method) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (contact_method !== "in_app" && !contact_value) {
    return NextResponse.json({ error: "Contact value is required" }, { status: 400 });
  }

  const { data, error } = await supabase.from("lost_found_posts").insert({
    user_id: authData.user.id,
    type,
    title,
    category,
    description,
    location,
    occurred_at,
    image_url: image_url || null,
    contact_method,
    contact_value: contact_method === "in_app" ? null : contact_value,
    status: "pending",
  }).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
