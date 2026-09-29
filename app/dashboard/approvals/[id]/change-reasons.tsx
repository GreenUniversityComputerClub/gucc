"use client";

import { useState } from "react";

const QUICK = [
  "Please add a cover image.",
  "Please fix spelling and grammar.",
  "Please add more detail (what, when, where, who).",
  "Please credit your sources or add links.",
  "This isn't a fit for the club's page.",
];

/** The reason the author sees, with one-tap common reasons (editable before sending). */
export function ChangeReasons({ name }: { name: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common reasons">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setValue((v) => (v.includes(q) ? v : `${v ? `${v} ` : ""}${q}`))}
            className="min-h-9 rounded-full border px-3 text-xs hover:bg-muted">{q.replace(/^Please /, "").replace(/\.$/, "")}</button>
        ))}
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        What needs to change? <span className="text-destructive">*</span>
        <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} required rows={3} maxLength={1000}
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
      </label>
    </div>
  );
}
