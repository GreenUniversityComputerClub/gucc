"use client";

import { createContext, useContext, useState } from "react";
import { ActionForm, Field } from "@/components/admin/ui";
import { changePositionAction } from "../../actions";

type Option = { value: string; label: string };
const Positions = createContext<Option[]>([]);

/** The committee's position choices, sent to the browser once for every row's "Change position". */
export function PositionOptions({ options, children }: { options: Option[]; children: React.ReactNode }) {
  return <Positions.Provider value={options}>{children}</Positions.Provider>;
}

/** One listing's "Change position": the list of positions appears only when asked for. */
export function ChangePosition({ committeeId, assignmentId, current }: { committeeId: string; assignmentId: string; current: string }) {
  const options = useContext(Positions);
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-sm underline">Change position…</button>;
  }
  return (
    <ActionForm action={changePositionAction.bind(null, committeeId, assignmentId)} submitLabel="Change position">
      <Field name="positionId" label="New position" type="select" defaultValue={current} options={options} />
      <Field name="keepTitle" label="Keep the displayed title" type="checkbox" />
    </ActionForm>
  );
}
