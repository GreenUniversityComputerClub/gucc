"use client"

import { FormPage } from "@/types/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Plus, Trash2 } from "lucide-react"

interface Props {
  pages: FormPage[]
  currentPage: number
  onPageChange: (index: number) => void
  onAddPage: () => void
  onRemovePage: (index: number) => void
  onUpdatePage: (index: number, patch: Partial<FormPage>) => void
}

export default function PageManager({
  pages,
  currentPage,
  onPageChange,
  onAddPage,
  onRemovePage,
  onUpdatePage,
}: Props) {
  if (pages.length === 1) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Single page form</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAddPage}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Page
          </Button>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instructions for this segment (optional)</Label>
          <Textarea
            value={pages[0]?.description ?? ""}
            onChange={(e) => onUpdatePage(0, { description: e.target.value })}
            placeholder="Anything the person filling this out should know before they start — e.g. what to prepare, deadlines, format expectations..."
            rows={2}
            className="text-xs resize-none"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {pages.map((page, i) => (
          <div key={i} className="flex items-center gap-1 group">
            <button
              onClick={() => onPageChange(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                currentPage === i
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              {page.title || `Page ${i + 1}`}
            </button>
            {pages.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                onClick={() => onRemovePage(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAddPage}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Page
        </Button>
      </div>

      {/* Edit current page title */}
      <Input
        value={pages[currentPage]?.title ?? ""}
        onChange={(e) => onUpdatePage(currentPage, { title: e.target.value })}
        placeholder={`Page ${currentPage + 1} title...`}
        className="h-7 text-xs max-w-xs"
      />

      {/* Edit current page instructions — shown to the person filling out this segment */}
      <div className="space-y-1">
        <Label className="text-xs">Instructions for this segment (optional)</Label>
        <Textarea
          value={pages[currentPage]?.description ?? ""}
          onChange={(e) => onUpdatePage(currentPage, { description: e.target.value })}
          placeholder="Anything the person should know before filling out this page..."
          rows={2}
          className="text-xs resize-none"
        />
      </div>
    </div>
  )
}
