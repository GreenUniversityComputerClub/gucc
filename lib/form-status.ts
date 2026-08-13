import type { FormConfig } from "@/types/form"

export type FormAvailability =
  | { open: true }
  | { open: false; reason: "closed" | "not-started" | "expired" }

/** Single source of truth for whether a form is currently accepting responses, checked both
 * client-side (to show the right screen) and server-side (to actually block submission). */
export function getFormAvailability(form: FormConfig, now: Date = new Date()): FormAvailability {
  if (form.status === "closed") return { open: false, reason: "closed" }
  if (form.opensAt && now < new Date(form.opensAt)) return { open: false, reason: "not-started" }
  if (form.closesAt && now > new Date(form.closesAt)) return { open: false, reason: "expired" }
  return { open: true }
}
