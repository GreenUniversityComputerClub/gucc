"use client";

import { useMemo, useState } from "react";
import { ActionForm, Field } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { PersonPicker, type PickedPerson } from "@/components/admin/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { assignExecutiveAction } from "../../actions";
import { unitLabel } from "@/lib/public/shapes";

export interface PositionOption {
  id: string;
  key: string;
  name: string;
  category: string;
  rank: number;
  isProtected: boolean;
  maxHolders: number | null;
  grants: Array<{ permission: string; scope: string; scopeValue: string }>;
}

const describeGrant = (g: PositionOption["grants"][number]) =>
  `${g.permission}${g.scope === "ALL" ? "" : ` (${g.scope.toLowerCase()}${g.scopeValue ? `: ${g.scopeValue}` : ""})`}`;

export function AddExecutive({ committeeId, positions, units, isModerator, flatAllowed = true }: { committeeId: string; positions: PositionOption[]; units: Array<{ key: string; type: string; name: string | null }>; isModerator: boolean; flatAllowed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [section, setSection] = useState<"STUDENT" | "FACULTY">("STUDENT");
  const [positionId, setPositionId] = useState("");
  const defaultUnit = flatAllowed ? "" : units[0]?.key ?? "";
  const [unit, setUnit] = useState(defaultUnit);
  const position = useMemo(() => positions.find((p) => p.id === positionId), [positions, positionId]);
  const grouped = useMemo(() => {
    const byCat = new Map<string, PositionOption[]>();
    for (const p of [...positions].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
    return [...byCat.entries()];
  }, [positions]);
  const needsInvite = mode === "new" || (person && !person.user_id);

  const reset = () => {
    setRound((r) => r + 1);
    setPerson(null);
    setPositionId("");
    setUnit(defaultUnit);
    setMode("existing");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button>Add executive</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add an executive</DialogTitle>
          <DialogDescription>Their position&apos;s permissions apply as soon as this committee is current and they have an account.</DialogDescription>
        </DialogHeader>
        <ActionForm key={round} action={assignExecutiveAction.bind(null, committeeId)} submitLabel="Add to committee" successMessage="Added." onSuccess={() => { setOpen(false); reset(); }}>
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-semibold">1. Who</legend>
            <div className="inline-flex rounded-md border p-0.5 text-sm" role="radiogroup" aria-label="Person">
              {(["existing", "new"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setPerson(null); }}
                  className={`rounded px-3 py-1.5 ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {m === "existing" ? "Existing person" : "New person"}
                </button>
              ))}
            </div>
            {mode === "existing" ? (
              <PersonPicker name="profileId" label="Person" required onChange={setPerson} hint="Members with an account get the position's permissions right away. Former executives keep their history." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="fullName" label="Full name" required />
                {section === "FACULTY" ? <Field name="designation" label="Designation" placeholder="Lecturer, Dept. of CSE" /> : <Field name="studentId" label="Student ID" placeholder="9 digits" hint="Used for their profile page /executives/<id>" />}
                <div className="sm:col-span-2"><MediaField name="avatarMediaId" label="Photo (optional)" shape="portrait" /></div>
              </div>
            )}
            {needsInvite && (
              <Field name="inviteEmail" label="Invite by email (optional)" type="email" placeholder="name@green.edu.bd" hint="They get a link to set a password; their account is linked to this profile automatically." />
            )}
          </fieldset>

          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-semibold">2. Position</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="ae-section" className="text-sm font-medium">Section</label>
                <select id="ae-section" name="section" value={section} onChange={(e) => setSection(e.target.value as typeof section)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="STUDENT">Student executives</option>
                  <option value="FACULTY">Faculty advisors</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="ae-position" className="text-sm font-medium">Position <span className="text-destructive">*</span></label>
                <select id="ae-position" name="positionId" required value={positionId} onChange={(e) => setPositionId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Choose a position…</option>
                  {grouped.map(([cat, list]) => (
                    <optgroup key={cat} label={cat.charAt(0) + cat.slice(1).toLowerCase()}>
                      {list.map((p) => <option key={p.id} value={p.id} disabled={p.isProtected && !isModerator}>{p.name}{p.isProtected ? " (Moderator only)" : ""}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            {position && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="font-medium">{position.name} can:</p>
                {position.grants.length === 0 ? (
                  <p className="text-muted-foreground">Baseline executive access only (read the admin, draft own posts, upload own media).</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">{position.grants.map(describeGrant).join(" · ")}</p>
                )}
                {position.maxHolders ? <p className="mt-1">At most {position.maxHolders} holder{position.maxHolders === 1 ? "" : "s"} per committee.</p> : null}
                <p className="mt-1 text-muted-foreground">Change these defaults in Positions; governance rules can add conditions.</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="title" label="Displayed title" placeholder={position?.name ?? "Defaults to the position name"} hint="e.g. Executive Member - 3" />
              <div className="grid gap-1.5">
                <label htmlFor="ae-unit" className="text-sm font-medium">Campus / wing</label>
                <select id="ae-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {flatAllowed && <option value="">Main committee</option>}
                  {units.map((u) => <option key={u.key} value={u.key}>{unitLabel(u.key, u.name)} ({u.type === "WING" ? "wing" : "campus"})</option>)}
                  <option value="__new">Add a new campus / wing…</option>
                </select>
                {unit && unit !== "__new" && <input type="hidden" name="unitKey" value={unit} />}
              </div>
              {unit === "__new" && (
                <>
                  <Field name="unitKey" label="Unit key" placeholder="e.g. permanent" hint="Lowercase letters, digits and hyphens" required />
                  <Field name="unitLabel" label="Unit name" placeholder="Permanent Campus" />
                  <Field name="unitType" label="Type" type="select" defaultValue="CAMPUS" options={[{ value: "CAMPUS", label: "Campus" }, { value: "WING", label: "Wing / sub-society" }]} />
                </>
              )}
              <Field name="displayOrder" label="Order" type="number" hint="Leave empty to add at the end" />
              <Field name="startDate" label="Start date" type="date" />
            </div>
          </fieldset>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
