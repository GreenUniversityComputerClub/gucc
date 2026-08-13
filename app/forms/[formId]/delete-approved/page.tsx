import Link from "next/link"
import { getForm } from "@/lib/forms"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react"

interface Props {
  params: Promise<{ formId: string }>
  searchParams: Promise<{ status?: string }>
}

const COPY: Record<string, { icon: typeof CheckCircle2; tone: string; title: string; body: (title?: string) => string }> = {
  ok: {
    icon: CheckCircle2,
    tone: "text-green-600 bg-green-100",
    title: "Deletion approved",
    body: (title) => `You approved deleting "${title}". The person who asked can now remove it from the Form Builder.`,
  },
  already: {
    icon: CheckCircle2,
    tone: "text-green-600 bg-green-100",
    title: "Already approved",
    body: (title) => `You already approved deleting "${title}" — no further action needed.`,
  },
  invalid: {
    icon: AlertTriangle,
    tone: "text-destructive bg-destructive/10",
    title: "Link not valid",
    body: () => "This approval link is invalid or has expired. Ask for a new delete request if this is unexpected.",
  },
  notfound: {
    icon: HelpCircle,
    tone: "text-muted-foreground bg-muted",
    title: "Form not found",
    body: () => "This form no longer exists — it may have already been deleted.",
  },
}

export default async function DeleteApprovedPage({ params, searchParams }: Props) {
  const { formId } = await params
  const { status } = await searchParams
  const copy = COPY[status ?? ""] ?? COPY.invalid
  const form = await getForm(formId)
  const Icon = copy.icon

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-2">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${copy.tone}`}>
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">{copy.body(form?.title)}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/forms">Back to Form Builder</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
