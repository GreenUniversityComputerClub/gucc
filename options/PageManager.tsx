"use client"

import { FormPage } from "@/types/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Single page form</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAddPage}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Page
        </Button>
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
    </div>
  )
}