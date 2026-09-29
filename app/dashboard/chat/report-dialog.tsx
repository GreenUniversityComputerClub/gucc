"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { reportChatAction, type ReportInput } from "./actions";

const CATEGORIES: Array<{ value: ReportInput["category"]; label: string; hint: string }> = [
  { value: "SPAM", label: "Spam", hint: "Advertising, repeated or unwanted messages." },
  { value: "HARASSMENT", label: "Harassment or bullying", hint: "Threats, insults, unwanted contact after being asked to stop." },
  { value: "INAPPROPRIATE", label: "Inappropriate content", hint: "Sexual, violent or hateful content." },
  { value: "SCAM", label: "Scam or impersonation", hint: "Asking for money or passwords, pretending to be someone else." },
  { value: "OTHER", label: "Something else", hint: "Tell the moderators what's wrong." },
];

/**
 * Report a message to the moderators. They see only this message (and the two before it, if
 * you choose), never the rest of the conversation. The person isn't told who reported them.
 */
export function ReportDialog({ messageId, personName, open, onOpenChange, onDone }: {
  messageId: string | null;
  personName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (result: { message: string; blocked: boolean }) => void;
}) {
  const id = useId();
  const [category, setCategory] = useState<ReportInput["category"] | "">("");
  const [details, setDetails] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(""); setDetails(""); setIncludeContext(false); setBlock(false); setError(null); setSent(null);
  }, [open, messageId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!messageId || busy) return;
    if (!category) return setError("Choose what's wrong.");
    if (category === "OTHER" && details.trim().length < 3) return setError("Tell the moderators briefly what's wrong.");
    setBusy(true);
    setError(null);
    const r = await reportChatAction(messageId, { category, details: details.trim(), includeContext, block }).catch(() => null);
    setBusy(false);
    if (!r) return setError("Couldn't send the report. Check your connection and try again.");
    if (!r.ok) return setError(r.error);
    const message = r.message ?? "Report sent.";
    setSent(message);
    onDone({ message, blocked: block });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        {sent ? (
          <div className="space-y-4 py-2 text-center" role="status">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <DialogTitle className="text-lg">Thank you for reporting</DialogTitle>
            <DialogDescription>{sent}</DialogDescription>
            <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Report this message</DialogTitle>
              <DialogDescription>
                Moderators see only this message{includeContext ? " and the two before it" : ""}, never the rest of your conversation. {personName} isn&apos;t told who reported it.
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">What&apos;s wrong?</legend>
              {CATEGORIES.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name={`${id}-cat`} value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
                  <span>
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="space-y-1">
              <label htmlFor={`${id}-details`} className="text-sm font-medium">Details {category === "OTHER" ? "" : <span className="font-normal text-muted-foreground">(optional)</span>}</label>
              <Textarea id={`${id}-details`} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} placeholder="Anything that helps the moderators understand." />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Include the 2 messages before it <span className="block text-xs text-muted-foreground">Helps when the message only makes sense in context.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Also block {personName} <span className="block text-xs text-muted-foreground">They won&apos;t be able to message you or find you. You can unblock later.</span></span>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="destructive" className="min-h-11 sm:min-h-10" disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
