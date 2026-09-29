"use client";

import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password-rules";
import { cn } from "@/lib/utils";

/** The password rules, ticked as they're met while the person types (the server checks the same list). */
export function PasswordChecklist({ id, password, email }: { id?: string; password: string; email?: string | null }) {
  return (
    <ul id={id} className="grid gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = password.length > 0 && r.ok(password, email);
        return (
          <li key={r.key} className={cn("flex items-center gap-1.5", ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3 w-3 shrink-0" aria-hidden />}
            <span>{r.label}<span className="sr-only">{ok ? " (met)" : " (not yet)"}</span></span>
          </li>
        );
      })}
    </ul>
  );
}
