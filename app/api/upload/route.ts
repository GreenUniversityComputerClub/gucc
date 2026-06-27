import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get("file") as File | null
  const fieldId = fd.get("fieldId") as string | null

  if (!file || !fieldId) {
    return NextResponse.json({ error: "Missing file or fieldId" }, { status: 400 })
  }

  const supabase = await createClient()
  const ext = file.name.split(".").pop() ?? "bin"
  const path = `submissions/${fieldId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from("form-uploads")
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = supabase.storage.from("form-uploads").getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}