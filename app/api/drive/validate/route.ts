import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { extractFolderId, validateFolder } from "@/lib/drive"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawFolder = searchParams.get("folderId") ?? ""

  const folderId = extractFolderId(rawFolder)
  if (!folderId) return NextResponse.json({ data: null, error: "Invalid Drive folder URL or ID" }, { status: 400 })

  const result = await validateFolder(folderId)
  if (!result.ok) return NextResponse.json({ data: null, error: result.error }, { status: 400 })

  return NextResponse.json({ data: { valid: true, name: result.name }, error: null })
}
