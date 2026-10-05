"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, CopyPlus, ExternalLink, Loader2, MoreHorizontal, Pencil, QrCode, RefreshCw, Sheet, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { QrDialog } from "@/components/forms/qr-dialog";
import { showFlash } from "@/lib/flash";
import { useSoftRefresh } from "@/lib/soft-refresh";
import { archiveFormAction, deleteFormAction, duplicateFormAction, recheckFormAction, restoreFormAction } from "./actions";

type Outcome = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

/** Everything you can do with one form, from its row. */
export function FormRowMenu({ form }: {
  form: { id: string; slug: string; title: string; url: string; status: "ACTIVE" | "ARCHIVED"; responsesUrl: string | null };
}) {
  const router = useRouter();
  const refresh = useSoftRefresh();
  const [confirm, dialog] = useConfirm();
  const [pending, start] = useTransition();
  const [qr, setQr] = useState(false);
  const archived = form.status === "ARCHIVED";
  const pageUrl = () => `${window.location.origin}/forms/${encodeURIComponent(form.slug)}`;
  const empty = new FormData();

  const run = (action: () => Promise<Outcome>, after?: (data: unknown) => void) => start(async () => {
    const r = await action();
    if (!r.ok) return showFlash(r.error);
    if (after) after(r.data);
    else refresh(r.message);
  });

  const copy = () => void navigator.clipboard?.writeText(pageUrl()).then(() => showFlash("Link copied."), () => showFlash(pageUrl()));

  return (
    <>
      {dialog}
      <QrDialog open={qr} onOpenChange={setQr} url={qr ? pageUrl() : ""} title={form.title} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Actions for ${form.title}`} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild><Link prefetch={false} href={`/dashboard/forms/${form.id}`}><Pencil aria-hidden />Edit</Link></DropdownMenuItem>
          {!archived && (
            <>
              <DropdownMenuItem asChild><a href={`/forms/${encodeURIComponent(form.slug)}`} target="_blank" rel="noopener"><ExternalLink aria-hidden />Open page</a></DropdownMenuItem>
              <DropdownMenuItem onSelect={copy}><Copy aria-hidden />Copy link</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setQr(true)}><QrCode aria-hidden />QR code</DropdownMenuItem>
            </>
          )}
          {form.responsesUrl && <DropdownMenuItem asChild><a href={form.responsesUrl} target="_blank" rel="noopener noreferrer"><Sheet aria-hidden />Responses</a></DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run(() => recheckFormAction(form.id, form.url))}><RefreshCw aria-hidden />Check again</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => duplicateFormAction(form.id, empty), (d) => {
            showFlash("Copied. Edit the copy.");
            router.push(`/dashboard/forms/${(d as { id: string }).id}`);
          })}><CopyPlus aria-hidden />Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          {archived ? (
            <>
              <DropdownMenuItem onSelect={() => run(() => restoreFormAction(form.id, empty))}><ArchiveRestore aria-hidden />Restore</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={async () => {
                if (await confirm({ title: `Delete “${form.title}”?`, description: <p>It leaves the dashboard and its addresses are freed. The answers stay in the form&apos;s own sheet. This can&apos;t be undone.</p>, confirmLabel: "Delete", destructive: true })) run(() => deleteFormAction(form.id, empty));
              }}><Trash2 aria-hidden />Delete</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={async () => {
              if (await confirm({ title: `Archive “${form.title}”?`, description: <p>Its page goes offline (/forms/{form.slug} shows “not found”). You can restore it any time.</p>, confirmLabel: "Archive" })) run(() => archiveFormAction(form.id, empty));
            }}><Archive aria-hidden />Archive</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** "Copy" next to an address in the list. */
export function CopyLink({ slug }: { slug: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={done ? "Copied" : `Copy the link to /forms/${slug}`}
      onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/forms/${encodeURIComponent(slug)}`).then(() => {
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      })}>
      <Copy className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** Check every form that hasn't been checked yet (one after another, with progress). */
export function CheckAllForms({ forms }: { forms: Array<{ id: string; url: string; title: string }> }) {
  const refresh = useSoftRefresh();
  const [done, setDone] = useState<number | null>(null);
  if (!forms.length) return null;
  const run = async () => {
    let failed = 0;
    for (const [i, f] of forms.entries()) {
      setDone(i);
      const r = await recheckFormAction(f.id, f.url).catch(() => null);
      if (!r?.ok) failed++;
    }
    setDone(null);
    refresh(failed ? `Checked ${forms.length - failed}; ${failed} couldn't be reached (open them to check again).` : `Checked ${forms.length} form${forms.length === 1 ? "" : "s"}.`);
  };
  return (
    <Button type="button" variant="outline" className="min-h-10 gap-1.5" disabled={done !== null} onClick={() => void run()}>
      {done !== null ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
      {done !== null ? `Checking ${done + 1} of ${forms.length}…` : `Check ${forms.length} unchecked`}
    </Button>
  );
}
