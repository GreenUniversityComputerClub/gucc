"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { LogoutButton } from "@/components/logout-button"

interface Form {
  title: string
  url: string
  slug: string
}

export default function FormsDashboard() {
  const router = useRouter()
  const [username, setUsername] = useState("Admin")
  const [forms, setForms] = useState<Form[]>([])
  const [filtered, setFiltered] = useState<Form[]>([])
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState<Form>({ title: "", url: "", slug: "" })
  const [editSlug, setEditSlug] = useState<string|null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    async function fetchForms() {
      setIsLoading(true)
      const res = await fetch("/api/forms")
      if (!res.ok) return router.replace("/auth/login")
      const data: Form[] = await res.json()
      setForms(data)
      setFiltered(data)
      setIsLoading(false)
    }
    fetchForms()
  }, [router])

  useEffect(() => {
    if (!search) return setFiltered(forms)
    const q = search.toLowerCase()
    setFiltered(forms.filter(f =>
      f.title.toLowerCase().includes(q) ||
      f.slug.toLowerCase().includes(q)
    ))
  }, [search, forms])

  const addForm = async () => {
    setIsLoading(true)
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setForms(updated)
      setFiltered(updated)
      setNewForm({ title: "", url: "", slug: "" })
      setShowAdd(false)
    }
    setIsLoading(false)
  }

  const deleteForm = async (slug: string) => {
    if (isLoading) return
    setIsLoading(true)
    const res = await fetch(`/api/forms?slug=${slug}`, { method: "DELETE" })
    if (res.ok) {
      const updated = await res.json()
      setForms(updated)
      setFiltered(updated)
    }
    setIsLoading(false)
  }

  const saveEdit = async () => {
    if (!editSlug) return
    setIsLoading(true)
    const res = await fetch(`/api/forms?slug=${editSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setForms(updated)
      setFiltered(updated)
      setNewForm({ title: "", url: "", slug: "" })
      setEditSlug(null)
    }
    setIsLoading(false)
  }

  const startEdit = (form: Form) => {
    setNewForm(form)
    setEditSlug(form.slug)
    setShowAdd(true)
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Forms Dashboard</h1>
          <p className="text-gray-600">Manage your Google Form links</p>
        </div>
        <div className="flex items-center space-x-4 mt-4 sm:mt-0">
          <span className="font-medium text-gray-700">{username}</span>
          <LogoutButton />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <Input
            placeholder="Search by title or slug"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={() => {
            setShowAdd(!showAdd)
            setEditSlug(null)
            setNewForm({ title: "", url: "", slug: "" })
          }} className="px-4 py-2 rounded-lg">
            {showAdd ? "Cancel" : "+ Add Form"}
          </Button>
        </CardHeader>

        {showAdd && (
          <CardContent className="border-b pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="form-title">Title</Label>
                <Input
                  id="form-title"
                  value={newForm.title}
                  onChange={e => setNewForm({ ...newForm, title: e.target.value })}
                  placeholder="Form title"
                />
              </div>
              <div>
                <Label htmlFor="form-url">URL</Label>
                <Input
                  id="form-url"
                  value={newForm.url}
                  onChange={e => setNewForm({ ...newForm, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="form-slug">Slug</Label>
                <Input
                  id="form-slug"
                  value={newForm.slug}
                  onChange={e => setNewForm({ ...newForm, slug: e.target.value })}
                  placeholder="custom-slug"
                  disabled={!!editSlug}
                />
              </div>
            </div>
            <Button onClick={editSlug ? saveEdit : addForm} className="mt-4 px-6 py-2 rounded-lg">
              {isLoading ? (
                <div className="w-5 h-5 border-t-2 border-blue-600 rounded-full animate-spin"></div>
              ) : (
                editSlug ? "Update" : "Save"
              )}
            </Button>
          </CardContent>
        )}

        <CardContent className="overflow-x-auto">
          <Table className="min-w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Title</TableHead>
                <TableHead className="w-1/2">URL</TableHead>
                <TableHead className="w-1/6">Slug</TableHead>
                <TableHead className="w-1/6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(form => (
                <TableRow key={form.slug} className="hover:bg-gray-50">
                  <TableCell className="break-words">{form.title}</TableCell>
                  <TableCell className="break-words max-w-xs overflow-hidden text-ellipsis">
                    <a
                      href={form.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-600"
                    >
                      {form.url}
                    </a>
                  </TableCell>
                  <TableCell className="text-center">{form.slug}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(form)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteForm(form.slug)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-t-2 border-blue-600 rounded-full animate-spin"></div>
                      ) : (
                        "Delete"
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
