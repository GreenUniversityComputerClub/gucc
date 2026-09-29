"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { dhakaDateTime } from "@/lib/time";
import { blockAction } from "./actions";

/** People you blocked, with Unblock (no page reload). */
export function BlockedList({ people }: { people: Array<{ id: string; name: string; since: string; avatarUrl: string | null }> }) {
  const [list, setList] = useState(people);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  return (
    <div>
      {/* Stays after the last person is unblocked, so the result is always said. */}
      {note && <p role={note.error ? "alert" : "status"} className={note.error ? "mb-2 text-sm text-destructive" : "mb-2 text-sm text-emerald-700 dark:text-emerald-400"}>{note.text}</p>}
      {list.length === 0 && <p className="text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>}
      <ul className="divide-y">
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <PersonAvatar name={p.name} url={p.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">Blocked {dhakaDateTime(p.since)}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="min-h-10" disabled={busy === p.id}
              onClick={async () => {
                setBusy(p.id);
                const r = await blockAction(p.id, false).catch(() => null);
                setBusy(null);
                if (r?.ok) {
                  setList((l) => l.filter((x) => x.id !== p.id));
                  setNote({ text: `Unblocked ${p.name}. You can message each other again.` });
                } else setNote({ text: r && !r.ok ? r.error : "Couldn't unblock. Try again.", error: true });
              }}>
              {busy === p.id ? "Unblocking…" : "Unblock"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
