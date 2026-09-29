"use client";

import { useId, useRef, useState } from "react";
import { Bold, Code, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { uploadImage } from "@/lib/media/client";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * A Markdown field with a small toolbar, image upload and a preview rendered by the same code
 * as the public site (raw HTML is shown as text, unsafe links dropped). The textarea keeps the
 * field name, so it works inside any server-action form.
 */
export function MarkdownEditor({ name, label, defaultValue, rows = 16, hint }: { name: string; label: string; defaultValue?: string | null; rows?: number; hint?: string }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, altDialog, ask] = useConfirm();

  /** Wrap the selection (or a placeholder) and keep it selected. */
  const wrap = (before: string, after = before, placeholder = "text") => {
    const t = ref.current;
    if (!t) return;
    const { selectionStart: a, selectionEnd: b } = t;
    const picked = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + before + picked + after + value.slice(b);
    setValue(next);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(a + before.length, a + before.length + picked.length);
    });
  };
  /** Prefix every selected line. */
  const lines = (prefix: (i: number) => string) => {
    const t = ref.current;
    if (!t) return;
    const start = value.lastIndexOf("\n", t.selectionStart - 1) + 1;
    const end = value.indexOf("\n", t.selectionEnd);
    const stop = end === -1 ? value.length : end;
    const block = value.slice(start, stop).split("\n").map((l, i) => prefix(i) + l).join("\n");
    setValue(value.slice(0, start) + block + value.slice(stop));
    requestAnimationFrame(() => t.focus());
  };
  const insertAtCursor = (text: string) => {
    const t = ref.current;
    setValue((v) => {
      const at = Math.min(t ? t.selectionEnd : v.length, v.length);
      const pad = at > 0 && v[at - 1] !== "\n" ? "\n\n" : "";
      return v.slice(0, at) + pad + text + "\n" + v.slice(at);
    });
  };

  /**
   * Upload an image and put it where the cursor was. A placeholder marks the spot at once, so
   * typing during the upload is kept, and the finished image replaces only the placeholder.
   */
  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const guess = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/[[\]]/g, "").slice(0, 80);
    const marker = `![Uploading ${guess}…](#uploading-${Date.now().toString(36)})`;
    insertAtCursor(marker);
    setUploading(file.name);
    const r = await uploadImage(file, { alt: guess });
    setUploading(null);
    const replace = (text: string) => setValue((v) => (v.includes(marker) ? v.replace(marker, text) : text ? `${v}\n\n${text}\n` : v));
    if (!r.ok) { replace(""); return setError(r.error); }
    if (!r.url) { replace(""); return setError("The image was saved as private, so it can't be shown in a post."); }
    // Alt text is what screen readers say and what shows if the image can't load.
    const alt = (await ask({
      title: "Describe this image", confirmLabel: "Insert image", cancelLabel: "Use the file name",
      input: { label: "Alt text", defaultValue: guess, hint: "One short sentence about what it shows, for readers who can't see it." },
    })) || guess;
    replace(`![${alt.replace(/[[\]]/g, "")}](${r.url})`);
  };

  const button = "inline-flex h-10 w-10 md:h-9 md:w-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  return (
    <div className="grid gap-1.5">
      {altDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <div role="tablist" aria-label="Editor view" className="flex gap-1 text-sm">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn("rounded-md px-2.5 py-1", tab === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{t === "write" ? "Write" : "Preview"}</button>
          ))}
        </div>
      </div>
      <div className="rounded-md border border-input">
        {tab === "write" && (
          <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1" role="toolbar" aria-label="Formatting">
            <button type="button" className={button} onClick={() => wrap("**")} aria-label="Bold" title="Bold"><Bold className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => wrap("_")} aria-label="Italic" title="Italic"><Italic className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => lines(() => "## ")} aria-label="Heading" title="Heading"><Heading2 className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => wrap("[", "](https://)", "link text")} aria-label="Link" title="Link"><Link2 className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => lines(() => "- ")} aria-label="Bulleted list" title="Bulleted list"><List className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => lines((i) => `${i + 1}. `)} aria-label="Numbered list" title="Numbered list"><ListOrdered className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => lines(() => "> ")} aria-label="Quote" title="Quote"><Quote className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={() => wrap("`")} aria-label="Code" title="Code"><Code className="h-4 w-4" /></button>
            <label className={cn(button, "cursor-pointer")} title="Upload and insert an image" aria-label="Insert image">
              <ImagePlus className="h-4 w-4" />
              <input type="file" accept="image/*" className="sr-only" disabled={Boolean(uploading)} onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {uploading && <span className="px-2 text-xs text-muted-foreground">Uploading {uploading}…</span>}
          </div>
        )}
        <textarea id={id} ref={ref} name={name} value={value} onChange={(e) => setValue(e.target.value)} rows={rows}
          className={cn("block w-full resize-y rounded-b-md bg-background px-3 py-2 font-mono text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 md:text-sm", tab === "preview" && "hidden")}
          aria-describedby={hint ? `${id}-hint` : undefined} />
        {tab === "preview" && (
          value.trim()
            // The same wrappers as the public post page, so the preview looks like the published post.
            ? <div className="article-reading-container max-h-[70vh] overflow-y-auto px-4 py-3"><div className="prose"><div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} /></div></div>
            : <p className="px-4 py-6 text-sm text-muted-foreground">Nothing to preview yet.</p>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
