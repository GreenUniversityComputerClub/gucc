import { FormConfig } from "@/types/form"

interface Props {
  form: FormConfig
  values: Record<string, string>
}

export default async function SubmitHandler({ form, values }: Props): Promise<void> {
  const fd = new FormData()
  fd.append("formId", form.id)
  for (const [key, val] of Object.entries(values)) {
    fd.append(key, val)
  }

  const res = await fetch("/api/sheets/submit", {
    method: "POST",
    body: fd,
  })

  const json = await res.json()
  if (json.error) throw new Error(json.error)
}