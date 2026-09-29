"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadResult } from "@/lib/media/client";
import { cn } from "@/lib/utils";

type Status = "waiting" | "preparing" | "uploading" | "done" | "failed" | "cancelled";
interface Item {
  key: number;
  file: File;
  status: Status;
  progress: number;
  message?: string;
  retryable?: boolean;
  controller?: AbortController;
}

export interface UploadHandlers {
  onProgress: (fraction: number) => void;
  /** Resizing is done and sending has started. */
  onPrepared: () => void;
  signal: AbortSignal;
}

/** Two at a time: fast on good connections without starving slow phones. */
const PARALLEL = 2;

/**
 * Drop files (or choose them), watch each one prepare and upload with its own progress, cancel
 * or retry any of them. Two files go at a time. `upload` does the work for one file.
 */
export function UploadQueue({ accept, max, label, hint, upload, onFinished, disabled }: {
  accept: string;
  max: number;
  label: string;
  hint: string;
  upload: (file: File, h: UploadHandlers) => Promise<UploadResult>;
  /** Called once when nothing is waiting or running any more (with how many succeeded). */
  onFinished?: (succeeded: number) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const counter = useRef(0);
  const running = useRef(0);
  const finishedReported = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((key: number, p: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...p } : i))), []);

  const start = useCallback((item: Item) => {
    running.current++;
    const controller = new AbortController();
    patch(item.key, { status: "preparing", progress: 0, message: undefined, controller });
    upload(item.file, {
      signal: controller.signal,
      onPrepared: () => patch(item.key, { status: "uploading" }),
      onProgress: (f) => patch(item.key, { status: "uploading", progress: f }),
    }).then((res) => {
      if (res.ok) patch(item.key, { status: "done", progress: 1, message: res.deduplicated ? "already in the library" : undefined });
      else if (controller.signal.aborted) patch(item.key, { status: "cancelled", message: "Cancelled." });
      else patch(item.key, { status: "failed", message: res.error, retryable: res.retryable });
    }).finally(() => {
      running.current--;
      setItems((all) => [...all]);
    });
  }, [patch, upload]);

  // Start waiting files while fewer than PARALLEL are running; report when all have settled.
  useEffect(() => {
    const waiting = items.filter((i) => i.status === "waiting");
    for (const item of waiting.slice(0, Math.max(0, PARALLEL - running.current))) start(item);
    const busy = items.some((i) => i.status === "waiting" || i.status === "preparing" || i.status === "uploading");
    if (!busy && items.length && !finishedReported.current) {
      finishedReported.current = true;
      onFinished?.(items.filter((i) => i.status === "done").length);
    }
  }, [items, start, onFinished]);

  const add = (files: FileList | File[] | null) => {
    if (!files || disabled) return;
    const list = Array.from(files).filter((f) => accept.split(",").some((a) => {
      const t = a.trim();
      return t.endsWith("/*") ? f.type.startsWith(t.slice(0, -1)) || (t === "image/*" && /\.(heic|heif)$/i.test(f.name)) : f.type === t || f.name.toLowerCase().endsWith(t.replace("application/", "."));
    })).slice(0, max);
    if (!list.length) return;
    finishedReported.current = false;
    setItems((all) => [...all.filter((i) => i.status !== "done" && i.status !== "cancelled"), ...list.map((file) => ({ key: ++counter.current, file, status: "waiting" as Status, progress: 0 }))]);
  };

  const busy = items.some((i) => i.status === "preparing" || i.status === "uploading" || i.status === "waiting");
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      className={cn("rounded-xl border-2 border-dashed bg-card p-4 transition-colors", over ? "border-primary bg-primary/5" : "border-border")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Drop files here or <button type="button" className="underline" onClick={() => inputRef.current?.click()} disabled={disabled}>{label}</button></p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <input ref={inputRef} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} aria-label={label} disabled={disabled}
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-2">
              <span className="w-40 truncate sm:w-64" title={it.file.name}>{it.file.name}</span>
              {it.status === "failed" || it.status === "cancelled" ? (
                <span className={cn("min-w-0 flex-1", it.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{it.message}</span>
              ) : (
                <span className="flex min-w-24 flex-1 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                    <span className={cn("block h-full bg-primary transition-all", it.status === "preparing" && "animate-pulse")} style={{ width: `${it.status === "preparing" ? 8 : Math.round(it.progress * 100)}%` }} />
                  </span>
                  <span className="w-24 text-muted-foreground">
                    {it.status === "waiting" ? "waiting" : it.status === "preparing" ? "resizing…" : it.status === "uploading" ? `${Math.round(it.progress * 100)}%` : it.message ?? "✓ done"}
                  </span>
                </span>
              )}
              {(it.status === "preparing" || it.status === "uploading" || it.status === "waiting") && (
                <button type="button" onClick={() => (it.controller ? it.controller.abort() : patch(it.key, { status: "cancelled", message: "Cancelled." }))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted" aria-label={`Cancel ${it.file.name}`}><X className="h-3.5 w-3.5" aria-hidden /></button>
              )}
              {(it.status === "failed" || it.status === "cancelled") && (
                <button type="button" onClick={() => { finishedReported.current = false; patch(it.key, { status: "waiting", progress: 0, message: undefined }); }}
                  className="inline-flex min-h-8 items-center gap-1 rounded px-2 hover:bg-muted" aria-label={`Try ${it.file.name} again`}><RotateCcw className="h-3 w-3" aria-hidden />Retry</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!busy && items.some((i) => i.status === "failed" || i.status === "cancelled") && (
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setItems((all) => all.filter((i) => i.status !== "failed" && i.status !== "cancelled"))}>Clear the list</Button>
      )}
    </div>
  );
}
