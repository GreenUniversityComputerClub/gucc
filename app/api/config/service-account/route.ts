import { NextResponse } from "next/server"
import { getServiceAccountEmail } from "@/lib/google-auth"

export async function GET() {
  try {
    const email = getServiceAccountEmail()
    return NextResponse.json({ data: { email }, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Service account not configured"
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
