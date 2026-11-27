"use client";

import { Field } from "@/components/admin/ui";
import { PeopleMultiPicker } from "@/components/admin/people-multi-picker";

export function ModeratorPicker({
  initial,
}: {
  initial: Array<{ userId: string; name: string | null; email: string; canEdit: boolean }>;
}) {
  return (
    <div className="space-y-3">
      <PeopleMultiPicker
        name="userIds"
        label="Assigned quiz moderators & co-hosts"
        initial={initial.map((m) => ({ userId: m.userId, name: m.name ?? m.email }))}
        hint="Assigned moderators with host permissions can control live sessions for this competition."
      />
      <Field name="canEdit" label="Also allow assigned moderators to edit quiz questions" type="checkbox" defaultValue={initial.some((m) => m.canEdit)} />
    </div>
  );
}
