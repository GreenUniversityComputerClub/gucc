"use client";

import { useState } from "react";
import { Field, FormSection } from "@/components/admin/ui";
import { MediaField } from "@/components/admin/media-field";
import { THEME_PRESET_DEFAULTS, type QuizScoringConfig, type QuizThemeConfig, type QuizThemePreset } from "@/lib/quiz/types";

interface OptionItem {
  id: string;
  title?: string;
  name?: string;
}

export function QuizFields({
  quiz,
  options,
}: {
  quiz?: Record<string, unknown> & { themeConfig?: QuizThemeConfig; scoringConfig?: QuizScoringConfig; bannerUrl?: string | null; logoUrl?: string | null };
  options?: { events: OptionItem[]; committees: OptionItem[] };
}) {
  const v = (k: string) => (quiz?.[k] as string | number | null | undefined) ?? null;
  const initialPreset = ((v("theme_preset") as QuizThemePreset | null) ?? "CYBER_ARENA");
  const [preset, setPreset] = useState<QuizThemePreset>(initialPreset);
  const baseTheme = quiz?.themeConfig ?? THEME_PRESET_DEFAULTS[preset];

  const [primary, setPrimary] = useState(baseTheme.primaryColor);
  const [secondary, setSecondary] = useState(baseTheme.secondaryColor);
  const [accent, setAccent] = useState(baseTheme.accentColor);
  const [surfaceStyle, setSurfaceStyle] = useState<"dark" | "light" | "vibrant">(baseTheme.surfaceStyle);

  const onPresetChange = (next: QuizThemePreset) => {
    setPreset(next);
    const t = THEME_PRESET_DEFAULTS[next];
    setPrimary(t.primaryColor);
    setSecondary(t.secondaryColor);
    setAccent(t.accentColor);
    setSurfaceStyle(t.surfaceStyle);
  };

  const scoring = quiz?.scoringConfig ?? { speedBonusMax: 500, incorrectPenalty: 0, maxPointsPerQuestion: null, partialCredit: false };

  return (
    <div className="space-y-5">
      <FormSection title="Basics" description="Competition identity, visibility, and registration access rules.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="title" label="Title" defaultValue={v("title")} required placeholder="e.g. Orientation Cyber Quiz 2026" className="md:col-span-2" />
          <Field name="topic" label="Topic / Track" defaultValue={v("topic")} placeholder="Programming, Web, AI, General Tech…" />
          <Field name="slug" label="URL slug" defaultValue={v("slug")} placeholder="orientation-cyber-quiz-2026" hint="Leave empty to auto-generate from the title." />
          <Field
            name="visibility"
            label="Listing visibility"
            type="select"
            defaultValue={v("visibility") ?? "PUBLIC"}
            options={[
              { value: "PUBLIC", label: "Public (listed on /quizzes)" },
              { value: "EVENT", label: "Event attendees & invite link" },
              { value: "MEMBERS", label: "GUCC members only" },
            ]}
          />
          <Field
            name="accessMode"
            label="Who can join"
            type="select"
            defaultValue={v("access_mode") ?? "GUEST"}
            options={[
              { value: "GUEST", label: "Students & external guests (with join code)" },
              { value: "REGISTERED", label: "Event registrants only (linked event)" },
              { value: "MEMBERS_ONLY", label: "Signed-in GUCC members only" },
            ]}
          />
          <Field
            name="eventId"
            label="Linked GUCC event (optional)"
            type="select"
            defaultValue={v("event_id") ?? ""}
            options={[
              { value: "", label: "None (standalone competition)" },
              ...(options?.events ?? []).map((e) => ({ value: e.id, label: e.title ?? e.id })),
            ]}
          />
          <Field
            name="committeeId"
            label="Organizing committee (optional)"
            type="select"
            defaultValue={v("committee_id") ?? ""}
            options={[
              { value: "", label: "None" },
              ...(options?.committees ?? []).map((c) => ({ value: c.id, label: c.name ?? c.id })),
            ]}
          />
          <Field
            name="description"
            label="Rules & overview"
            type="textarea"
            rows={4}
            defaultValue={v("description")}
            placeholder="Describe prizes, eligibility, tie-breaking rules, or session details…"
            className="md:col-span-2"
          />
        </div>
      </FormSection>

      <FormSection title="Scoring & timing" description="Server-authoritative timers and scoring behavior calculated inside QuizRoom.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            name="scoringMode"
            label="Scoring formula"
            type="select"
            defaultValue={v("scoring_mode") ?? "SPEED_BONUS"}
            options={[
              { value: "SPEED_BONUS", label: "Base points + speed bonus" },
              { value: "FIXED", label: "Fixed base points per question" },
            ]}
          />
          <Field
            name="defaultTimeLimitSec"
            label="Default question timer (seconds)"
            type="number"
            defaultValue={v("default_time_limit_sec") ?? 20}
            hint="Between 5 and 300 seconds. Individual questions can override this."
          />
          <Field
            name="speedBonusMax"
            label="Max speed bonus points"
            type="number"
            defaultValue={scoring.speedBonusMax}
            hint="Linearly scaled by remaining answer time when scoring mode includes speed."
          />
          <Field
            name="incorrectPenalty"
            label="Incorrect answer penalty"
            type="number"
            defaultValue={scoring.incorrectPenalty}
            hint="Default 0. Subtracted when a submitted answer is wrong."
          />
          <Field
            name="maxPointsPerQuestion"
            label="Max points cap per question (optional)"
            type="number"
            defaultValue={scoring.maxPointsPerQuestion ?? ""}
            placeholder="No cap"
          />
          <div className="flex flex-col justify-center gap-1 pt-2">
            <Field name="partialCredit" label="Award partial credit on multi-select" type="checkbox" defaultValue={scoring.partialCredit} />
            <Field name="shuffleQuestions" label="Shuffle question order per session" type="checkbox" defaultValue={Boolean(v("shuffle_questions"))} />
            <Field name="shuffleOptions" label="Shuffle option order in display" type="checkbox" defaultValue={Boolean(v("shuffle_options"))} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Theme & branding" description="Choose a visual preset and validated accent palette (no arbitrary CSS/HTML).">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="themePreset-sel" className="text-sm font-medium">Theme preset</label>
            <select
              id="themePreset-sel"
              name="themePreset"
              value={preset}
              onChange={(e) => onPresetChange(e.target.value as QuizThemePreset)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="CYBER_ARENA">Cyber Arena (dark + cyan)</option>
              <option value="ACADEMIC">Academic (clean blue)</option>
              <option value="GAME_SHOW">Game Show (vibrant purple + gold)</option>
              <option value="EVENT_SPECIAL">Event Special (GUCC emerald)</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="surfaceStyle-sel" className="text-sm font-medium">Surface style</label>
            <select
              id="surfaceStyle-sel"
              name="surfaceStyle"
              value={surfaceStyle}
              onChange={(e) => setSurfaceStyle(e.target.value as "dark" | "light" | "vibrant")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="vibrant">Vibrant</option>
            </select>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span>Primary</span>
              <input type="color" name="primaryColor" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border p-0.5" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span>Secondary</span>
              <input type="color" name="secondaryColor" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border p-0.5" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span>Accent</span>
              <input type="color" name="accentColor" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 cursor-pointer rounded border p-0.5" />
            </label>
            <div
              className="flex flex-1 min-w-44 items-center justify-between rounded-lg border px-4 py-2 text-xs font-medium"
              style={{ backgroundColor: primary, color: surfaceStyle === "light" ? "#0f172a" : "#ffffff", borderColor: accent }}
            >
              <span>Theme preview</span>
              <span className="rounded px-2 py-0.5 font-semibold" style={{ backgroundColor: accent, color: "#0f172a" }}>Accent</span>
            </div>
          </div>
          <Field name="showCountdown" label="Show live countdown bar to players" type="checkbox" defaultValue={baseTheme.showCountdown} />
          <Field name="showLiveLeaderboard" label="Show top leaderboard after reveal" type="checkbox" defaultValue={baseTheme.showLiveLeaderboard} />
          <MediaField name="bannerMediaId" label="Banner image (16:9)" defaultId={v("banner_media_id") as string | null} defaultUrl={quiz?.bannerUrl} />
          <MediaField name="logoMediaId" label="Competition logo" defaultId={v("logo_media_id") as string | null} defaultUrl={quiz?.logoUrl} shape="portrait" />
        </div>
      </FormSection>
    </div>
  );
}
