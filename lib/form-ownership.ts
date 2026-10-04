import type { FormConfig } from "@/types/form"

/** Whether this user may edit/delete the form. Legacy forms saved before creator-tracking
 * existed have no createdByEmail on record, so they stay open to every executive. */
export function isFormOwner(form: Pick<FormConfig, "createdByEmail">, email: string | null | undefined): boolean {
  if (!form.createdByEmail) return true
  return !!email && form.createdByEmail === email
}
