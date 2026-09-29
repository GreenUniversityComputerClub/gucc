"use client";

/**
 * Structured editors that replace raw JSON textareas in the admin. Each keeps
 * its rows in state and writes JSON into a hidden input, so the surrounding
 * server-action form and the API's validation stay unchanged.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PersonPicker } from "./person-picker";

const input = "h-10 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";

let rowSeq = 0;
const rowKey = () => `row-${++rowSeq}`;

/**
 * An editable list. Each row keeps a stable key through moves and removals, so an input (or a
 * person picker) always stays with its own row: removing the first coordinator can never make the
 * form show one person while saving another.
 */
export function Rows<T>({ rows, setRows, render, empty, addLabel, blank, max = 50 }: { rows: T[]; setRows: (r: T[]) => void; render: (row: T, update: (patch: Partial<T>) => void, i: number) => React.ReactNode; empty: string; addLabel: string; blank: T; max?: number }) {
  const [keys, setKeys] = useState<string[]>(() => rows.map(rowKey));
  // Rows replaced from outside (rare): keep the keys in step.
  const aligned = keys.length === rows.length ? keys : rows.map((_, i) => keys[i] ?? rowKey());
  if (aligned !== keys) setKeys(aligned);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const copy = [...rows];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    const k = [...aligned];
    [k[i], k[j]] = [k[j]!, k[i]!];
    setKeys(k);
    setRows(copy);
  };
  const remove = (i: number) => {
    setKeys(aligned.filter((_, k) => k !== i));
    setRows(rows.filter((_, k) => k !== i));
  };
  const add = () => {
    setKeys([...aligned, rowKey()]);
    setRows([...rows, { ...blank }]);
  };
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      {rows.map((row, i) => (
        <div key={aligned[i]} className="rounded-lg border bg-background p-3">
          {render(row, (patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r))), i)}
          <div className="mt-2 flex justify-end gap-1">
            <Button type="button" size="sm" variant="ghost" className="min-h-10 min-w-10" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-10 min-w-10" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">↓</Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-10 text-destructive" onClick={() => remove(i)}>Remove</Button>
          </div>
        </div>
      ))}
      {rows.length < max && <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={add}>{addLabel}</Button>}
    </div>
  );
}

// ── event people ──
export interface EventPersonRow { role: string; name: string; title?: string; userId?: string | null; email?: string | null }
const PEOPLE_ROLES = [["SPEAKER", "Speaker"], ["COORDINATOR", "Coordinator"], ["PHOTOGRAPHER", "Photographer"]];

export function EventPeopleEditor({ name, initial }: { name: string; initial: EventPersonRow[] }) {
  const [rows, setRows] = useState<EventPersonRow[]>(initial);
  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(rows.map((r) => ({ role: r.role, name: r.name, title: r.title || undefined, userId: r.userId || undefined })))} />
      <Rows
        rows={rows}
        setRows={setRows}
        empty="No one assigned yet."
        addLabel="Add person"
        blank={{ role: "COORDINATOR", name: "" }}
        render={(r, update) => (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr]">
            <select aria-label="Role" value={r.role} onChange={(e) => update({ role: e.target.value })} className={input}>
              {PEOPLE_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input aria-label="Name" placeholder="Name" value={r.name} onChange={(e) => update({ name: e.target.value })} className={input} />
            <input aria-label="Title" placeholder="Title (optional)" value={r.title ?? ""} onChange={(e) => update({ title: e.target.value })} className={input} />
            {["COORDINATOR", "PHOTOGRAPHER"].includes(r.role) && (
              <div className="sm:col-span-3">
                <PersonPicker
                  // A different person chosen elsewhere (or undone) starts the picker afresh.
                  key={r.userId ?? "none"}
                  label="Member account (gives them access to this event)"
                  valueKind="user"
                  initial={r.userId ? { id: r.userId, full_name: r.name || "Selected member", student_id: null, user_id: r.userId, email: r.email ?? null, person_type: "STUDENT", roles_held: null } : null}
                  onChange={(p) => update({ userId: p?.user_id ?? null, email: p?.email ?? null, name: r.name || p?.full_name || "" })}
                />
              </div>
            )}
          </div>
        )}
      />
    </>
  );
}

// ── registration questions ──
export interface RegFieldRow { key: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; required?: boolean; options?: string[] }
const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^([^a-z])/, "q_$1").slice(0, 40) || "question";

export function RegistrationFieldsEditor({ name, initial }: { name: string; initial: RegFieldRow[] }) {
  const [rows, setRows] = useState<Array<RegFieldRow & { optionsText?: string }>>(initial.map((r) => ({ ...r, optionsText: (r.options ?? []).join(", ") })));
  const out = rows.filter((r) => r.label.trim()).map((r, i, all) => {
    let key = r.key || keyOf(r.label);
    // Keep a numbered duplicate within the 41 characters the API accepts.
    if (all.slice(0, i).some((x) => (x.key || keyOf(x.label)) === key)) key = `${key.slice(0, 36)}_${i + 1}`;
    return { key, label: r.label.trim(), type: r.type, required: Boolean(r.required), ...(r.type === "select" ? { options: (r.optionsText ?? "").split(",").map((o) => o.trim()).filter(Boolean) } : {}) };
  });
  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(out)} />
      <Rows
        rows={rows}
        setRows={setRows}
        max={20}
        empty="Only name, email and student ID are asked. Add questions if you need more."
        addLabel="Add question"
        blank={{ key: "", label: "", type: "text", required: false }}
        render={(r, update) => (
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
            <input aria-label="Question" placeholder="Question, e.g. T-shirt size" value={r.label} onChange={(e) => update({ label: e.target.value })} className={input} />
            <select aria-label="Answer type" value={r.type} onChange={(e) => update({ type: e.target.value as RegFieldRow["type"] })} className={input}>
              <option value="text">Short answer</option>
              <option value="textarea">Paragraph</option>
              <option value="select">Choose one</option>
              <option value="checkbox">Checkbox</option>
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(r.required)} onChange={(e) => update({ required: e.target.checked })} /> Required</label>
            {r.type === "select" && (
              <input aria-label="Choices" placeholder="Choices, comma separated (S, M, L, XL)" value={r.optionsText ?? ""} onChange={(e) => update({ optionsText: e.target.value })} className={`${input} sm:col-span-3`} />
            )}
          </div>
        )}
      />
    </>
  );
}

// ── contest teams ──
export interface TeamRow { name: string; members: string[]; rank: number | null; achievement: string }

export function TeamsEditor({ name, initial }: { name: string; initial: TeamRow[] }) {
  const [rows, setRows] = useState<Array<TeamRow & { membersText?: string }>>(initial.map((t) => ({ ...t, membersText: t.members.join(", ") })));
  const out = rows.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), members: (t.membersText ?? "").split(",").map((m) => m.trim()).filter(Boolean), rank: t.rank ?? null, achievement: t.achievement?.trim() || undefined }));
  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(out)} />
      <Rows
        rows={rows}
        setRows={setRows}
        max={200}
        empty="No teams yet."
        addLabel="Add team"
        blank={{ name: "", members: [], rank: null, achievement: "" }}
        render={(t, update) => (
          <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
            <input aria-label="Team name" placeholder="Team name" value={t.name} onChange={(e) => update({ name: e.target.value })} className={input} />
            <input aria-label="Rank" placeholder="Rank" type="number" min={1} value={t.rank ?? ""} onChange={(e) => update({ rank: e.target.value ? Number(e.target.value) : null })} className={input} />
            <input aria-label="Members" placeholder="Members, comma separated" value={t.membersText ?? ""} onChange={(e) => update({ membersText: e.target.value })} className={`${input} sm:col-span-2`} />
            <input aria-label="Achievement" placeholder="Achievement (optional), e.g. Champion" value={t.achievement ?? ""} onChange={(e) => update({ achievement: e.target.value })} className={`${input} sm:col-span-2`} />
          </div>
        )}
      />
    </>
  );
}

// ── approval policy approvers ──
export interface ApproverRow { type: "position" | "role" | "user" | "assigned" | "permission"; value?: string }

/** Permissions that make sense as "anyone who can …" approver groups. */
const REVIEW_PERMISSIONS = [
  { key: "posts.publish", name: "Publish posts (e.g. the Publication Secretary)" },
  { key: "events.publish", name: "Publish events" },
  { key: "members.approve", name: "Approve members" },
  { key: "recruitment.manage", name: "Manage recruitment" },
];

export function ApproversEditor({ name, initial, positions, roles }: { name: string; initial: ApproverRow[]; positions: Array<{ key: string; name: string }>; roles: Array<{ key: string; name: string }> }) {
  const [rows, setRows] = useState<ApproverRow[]>(initial);
  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => r.type !== "assigned" && r.value))} />
      <Rows
        rows={rows}
        setRows={setRows}
        max={10}
        empty="Add at least one approver group."
        addLabel="Add approver group"
        blank={{ type: "position", value: "" }}
        render={(r, update) => (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <select aria-label="Approver type" value={r.type} onChange={(e) => update({ type: e.target.value as ApproverRow["type"], value: "" })} className={input}>
              <option value="position">Position</option>
              <option value="role">Role</option>
              <option value="permission">Anyone who can…</option>
            </select>
            {r.type === "position" && (
              <select aria-label="Position" value={r.value ?? ""} onChange={(e) => update({ value: e.target.value })} className={input}>
                <option value="">Choose…</option>
                {positions.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            )}
            {r.type === "permission" && (
              <select aria-label="Permission" value={r.value ?? ""} onChange={(e) => update({ value: e.target.value })} className={input}>
                <option value="">Choose…</option>
                {REVIEW_PERMISSIONS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            )}
            {r.type === "role" && (
              <select aria-label="Role" value={r.value ?? ""} onChange={(e) => update({ value: e.target.value })} className={input}>
                <option value="">Choose…</option>
                {roles.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            )}
          </div>
        )}
      />
    </>
  );
}
