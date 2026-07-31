import { sanitizeRichText } from "@/components/form-builder/RichTextEditor"

/** Renders sanitized rich-text HTML produced by RichTextEditor (bold, lists, links). */
export default function RichText({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_a]:text-primary [&_p]:my-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  )
}
