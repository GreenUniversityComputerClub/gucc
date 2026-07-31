"use client"

import { useEffect, useRef } from "react"
import DOMPurify from "isomorphic-dompurify"
import { Bold, Italic, List, ListOrdered, Link2, RemoveFormatting, type LucideIcon } from "lucide-react"

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "a", "h3", "h4", "blockquote", "span"]
const ALLOWED_ATTR = ["href", "target", "rel"]

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html ?? "", { ALLOWED_TAGS, ALLOWED_ATTR })
}

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

/** Minimal rich-text editor (bold, italic, lists, links) for form descriptions and
 * success messages. Pasting from ChatGPT/Docs/Word keeps its formatting because the
 * browser hands us real HTML on paste — we just sanitize it down to a safe subset. */
export default function RichTextEditor({ value, onChange, placeholder, className = "", minHeight = "80px" }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Set the initial content once. Deliberately uncontrolled after that — re-writing
  // innerHTML on every keystroke would fight the browser's own cursor position.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeRichText(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => {
    if (!ref.current) return
    onChange(sanitizeRichText(ref.current.innerHTML))
  }

  const exec = (command: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData("text/html")
    if (html) {
      document.execCommand("insertHTML", false, sanitizeRichText(html))
    } else {
      const text = e.clipboardData.getData("text/plain")
      document.execCommand("insertText", false, text)
    }
    emit()
  }

  const isEmpty = !value || value === "<br>"

  return (
    <div className={`border rounded-md bg-background ${className}`}>
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1 bg-muted/30 rounded-t-md">
        <ToolbarButton onClick={() => exec("bold")} icon={Bold} label="Bold" />
        <ToolbarButton onClick={() => exec("italic")} icon={Italic} label="Italic" />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} icon={List} label="Bullet list" />
        <ToolbarButton onClick={() => exec("insertOrderedList")} icon={ListOrdered} label="Numbered list" />
        <ToolbarButton
          onClick={() => {
            const url = window.prompt("Link URL (https://...)")
            if (url) exec("createLink", url)
          }}
          icon={Link2}
          label="Link"
        />
        <ToolbarButton onClick={() => exec("removeFormat")} icon={RemoveFormatting} label="Clear formatting" />
      </div>
      <div className="relative">
        {isEmpty && placeholder && (
          <p className="absolute top-2 left-3 text-sm text-muted-foreground pointer-events-none select-none">
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onPaste={handlePaste}
          className="px-3 py-2 text-sm focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_a]:text-primary [&_p]:my-1"
          style={{ minHeight }}
        />
      </div>
    </div>
  )
}

function ToolbarButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Keep focus/selection inside the editable div so the command applies to it, not the button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
