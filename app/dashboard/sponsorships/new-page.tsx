"use client";

/**
 * Start a new sponsorship page from a template: one event, the whole club (named after no event,
 * to send to any company), a hackathon, a workshop series, or blank. It starts hidden; the editor opens next.
 */
import { useState } from "react";
import { CalendarDays, Code2, FileText, GraduationCap, Handshake } from "lucide-react";
import { ActionForm, Field, type Result } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { SPONSORSHIP_TEMPLATES, type SponsorshipContent, type SponsorshipTemplate } from "@/lib/sponsorship/content";

const ICONS = { event: CalendarDays, partnership: Handshake, hackathon: Code2, workshops: GraduationCap, blank: FileText } as const;

/** The club's own parts (contacts, partner logos, achievements), from the default page. */
export type ClubParts = Pick<SponsorshipContent, "contacts" | "previousPartners" | "achievements">;

export function NewSponsorshipForm({ action, club }: { action: (fd: FormData) => Promise<Result>; club: ClubParts | null }) {
  const [template, setTemplate] = useState<SponsorshipTemplate>("partnership");
  const t = SPONSORSHIP_TEMPLATES[template];
  // Event and club pages share the club's real contacts, logos and record (edit them after).
  const content = template === "blank" ? t.content : { ...t.content, ...Object.fromEntries(Object.entries(club ?? {}).filter(([, v]) => Array.isArray(v) && v.length > 0)) };
  return (
    <ActionForm action={action} submitLabel="Create and edit" redirectTo="/dashboard/sponsorships/{id}">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Start from</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(SPONSORSHIP_TEMPLATES) as SponsorshipTemplate[]).map((k) => {
            const Icon = ICONS[k];
            const x = SPONSORSHIP_TEMPLATES[k];
            return (
              <label key={k} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                template === k ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                <input type="radio" name="template" value={k} checked={template === k} onChange={() => setTemplate(k)} className="sr-only" />
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", template === k ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{x.label}</span>
                  <span className="block text-xs text-muted-foreground">{x.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <div className="grid gap-3 md:grid-cols-2">
        {/* Remounted per template so its suggested title fills in. */}
        <Field key={template} name="title" label="Title" required defaultValue={t.title} placeholder={template === "partnership" ? "e.g. Partner with GUCC 2027" : "e.g. Hackathon 2027"} />
        <Field name="slug" label="Address" hint="/sponsors/<address>. Empty: made from the title." />
      </div>
      <Field name="summary" label="Summary" type="textarea" rows={2} hint="One or two sentences for /become-a-sponsor, search results and link previews." />
    </ActionForm>
  );
}
