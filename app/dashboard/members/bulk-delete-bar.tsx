"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReauthPrompt } from "@/components/admin/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSoftRefresh } from "@/lib/soft-refresh";
import { bulkDeleteApplicationsAction } from "../actions";

const selected = () => Array.from(document.querySelectorAll<HTMLInputElement>("input[data-member-id]:checked")).map((i) => i.value);

/**
 * Tick applications in the list (spam or rejected sign-ups) and delete them together. Members,
 * people on a committee and leaders are never deleted this way; the result says who was skipped.
 */
export function BulkDeleteBar() {
  const [count, setCount] = useState(0);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reauth, setReauth] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const refresh = useSoftRefresh();
  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.matches("input[data-member-id]")) setCount(selected().length);
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  const run = () => start(async () => {
    const ids = selected();
    const r = await bulkDeleteApplicationsAction(ids, reason);
    if (!r.ok) {
      if (r.code === "REAUTH_REQUIRED") return setReauth(r.error);
      return setMessage({ ok: false, text: r.error });
    }
    const skipped = r.data?.skipped ?? [];
    setMessage({ ok: true, text: `Deleted ${r.data?.deleted ?? 0}.${skipped.length ? ` Skipped ${skipped.map((x) => `${x.name} (${x.why})`).join(", ")}.` : ""}` });
    refresh(`Deleted ${r.data?.deleted ?? 0} application${r.data?.deleted === 1 ? "" : "s"}.`);
  });

  const go = async () => {
    if (reason.trim().length < 3) return setMessage({ ok: false, text: "Say why (kept in the activity log)." });
    if (!(await confirm({ title: `Delete ${count} application${count === 1 ? "" : "s"}?`, description: "Their accounts and details are erased. This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
    run();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
      {confirmDialog}
      {reauth && <ReauthPrompt message={reauth} onConfirmed={() => { setReauth(null); run(); }} onCancel={() => setReauth(null)} />}
      <span className="font-medium">{count ? `${count} selected` : "Tick applications to delete them together"}</span>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. spam sign-ups)" aria-label="Reason"
        className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:h-9 md:text-sm" />
      <Button type="button" variant="destructive" className="min-h-10 gap-1.5" disabled={!count || pending} onClick={() => void go()}>
        <Trash2 className="h-4 w-4" aria-hidden />{pending ? "Deleting…" : "Delete selected"}
      </Button>
      {message && <p role="status" className={message.ok ? "w-full text-emerald-700 dark:text-emerald-400" : "w-full text-destructive"}>{message.text}</p>}
    </div>
  );
}
