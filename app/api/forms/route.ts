import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { promises as fs } from "fs"
import path from "path"

const filePath = path.join(process.cwd(), "data", "forms.json")

function createClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
      },
    }
  )
}

async function readForms() {
  try {
    const data = await fs.readFile(filePath, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Error reading forms:", error)
    return []
  }
}

async function writeForms(forms: any[]) {
  try {
    await fs.writeFile(filePath, JSON.stringify(forms, null, 2), "utf-8")
  } catch (error) {
    console.error("Error writing forms:", error)
  }
}

async function isAuthenticated(req: NextRequest) {
  const supabase = createClient(req)
  const { data } = await supabase.auth.getUser()
  return data.user || null
}

// GET
export async function GET(req: NextRequest) {
  const user = await isAuthenticated(req)
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url))

  try {
    const forms = await readForms()
    return NextResponse.json(forms)
  } catch (error) {
    console.error("Error fetching forms:", error)
    return NextResponse.json({ error: "Failed to fetch forms" }, { status: 500 })
  }
}

// POST
export async function POST(req: NextRequest) {
  const user = await isAuthenticated(req)
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url))

  try {
    const newForm = await req.json()
    const { title, url, slug: customSlug } = newForm
    if (!title || !url)
      return NextResponse.json({ error: "Title and URL are required" }, { status: 400 })

    const forms = await readForms()
    const slug = customSlug || title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "")
    const exists = forms.some((f: any) => f.slug === slug)
    if (exists)
      return NextResponse.json({ error: "Form with this slug already exists" }, { status: 400 })

    const updated = [...forms, { title, url, slug }]
    await writeForms(updated)

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error adding form:", error)
    return NextResponse.json({ error: "Failed to add form" }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  const user = await isAuthenticated(req)
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url))

  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug)
      return NextResponse.json({ error: "Slug is required to delete the form" }, { status: 400 })

    const forms = await readForms()
    const updated = forms.filter((f: any) => f.slug !== slug)
    await writeForms(updated)

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error deleting form:", error)
    return NextResponse.json({ error: "Failed to delete form" }, { status: 500 })
  }
}

// ✅ PUT: Update form
export async function PUT(req: NextRequest) {
  const user = await isAuthenticated(req)
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url))

  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug)
      return NextResponse.json({ error: "Slug is required to update the form" }, { status: 400 })

    const updatedForm = await req.json()
    const { title, url } = updatedForm
    if (!title || !url)
      return NextResponse.json({ error: "Title and URL are required" }, { status: 400 })

    const forms = await readForms()
    const index = forms.findIndex((f: any) => f.slug === slug)
    if (index === -1)
      return NextResponse.json({ error: "Form not found" }, { status: 404 })

    forms[index] = { ...forms[index], title, url }
    await writeForms(forms)

    return NextResponse.json(forms)
  } catch (error) {
    console.error("Error updating form:", error)
    return NextResponse.json({ error: "Failed to update form" }, { status: 500 })
  }
}
