"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { conflictsAction } from "./actions";

/**
 * Warns while scheduling when someone invited already has a meeting at that time. Reads the
 * surrounding form (start, end and participants) and asks once the person stops typing.
 */
export function ConflictHint({ exceptId }: { exceptId?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [conflicts, setConflicts] = useState<Array<{ name: string; title: string; starts_at: string }>>([]);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = "";
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const fd = new FormData(form);
        const startsAt = String(fd.get("startsAt") ?? "");
        const participants = String(fd.get("participants") ?? "").split(",").filter(Boolean);
        const key = `${startsAt}|${fd.get("endsAt") ?? ""}|${participants.join(",")}`;
        if (key === last) return;
        last = key;
        if (!startsAt || !participants.length) return setConflicts([]);
        conflictsAction({ startsAt, endsAt: String(fd.get("endsAt") ?? "") || undefined, participants, exceptId }).then(setConflicts, () => setConflicts([]));
      }, 800);
    };
    form.addEventListener("input", check);
    form.addEventListener("change", check);
    // The participant picker writes a hidden input: check now and then.
    const poll = setInterval(check, 2500);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      form.removeEventListener("input", check);
      form.removeEventListener("change", check);
    };
  }, [exceptId]);
  return (
    <p ref={ref} role="status" aria-live="polite" className={conflicts.length ? "flex gap-2 rounded-lg border border-amber-400/60 bg-amber-500/10 p-3 text-sm" : "sr-only"}>
      {conflicts.length > 0 && (
        <>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            Already busy then: {conflicts.slice(0, 5).map((c) => `${c.name} (${c.title}, ${new Date(c.starts_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })})`).join("; ")}
            {conflicts.length > 5 ? ` and ${conflicts.length - 5} more` : ""}. You can still schedule it.
          </span>
        </>
      )}
    </p>
  );
}
