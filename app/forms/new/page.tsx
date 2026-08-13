import { requireExecutive } from "@/lib/auth/require-executive"
import NewFormClient from "./NewFormClient"

export default async function NewFormPage() {
  await requireExecutive("/forms/new")
  return <NewFormClient />
}
