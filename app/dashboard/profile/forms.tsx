"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarCropper } from "@/components/profile/avatar-cropper";
import { uploadImage } from "@/lib/media/client";
import { reloadWith } from "@/lib/flash";
import { ActionForm } from "@/components/admin/ui";
import { markNotificationsReadAction, saveEmailPreferencesAction, setAvatarAction, updateProfileAction } from "./actions";

/** Profile photo: framed in the browser, uploaded to R2 through the API, then set on the profile. */
export function AvatarUploader({ url, name, canUpload }: { url: string | null; name: string; canUpload: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  async function upload(file: File) {
    setPicked(null);
    setBusy(true);
    setError(null);
    const up = await uploadImage(file, { purpose: "avatar" });
    const res = up.ok ? await setAvatarAction(up.id) : null;
    setBusy(false);
    if (!up.ok) setError(up.error);
    else if (res && !res.ok) setError(res.error);
    else reloadWith("Photo updated.");
  }

  return (
    <div className="shrink-0">
      <label className={`group relative block h-20 w-20 overflow-hidden rounded-full border sm:h-24 sm:w-24 ${canUpload ? "cursor-pointer" : ""}`} aria-label={canUpload ? "Change profile photo" : undefined}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">{initials}</span>
        )}
        {canUpload && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">{busy ? "Uploading…" : "Change"}</span>}
        {canUpload && (
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setPicked(f);
          }} />
        )}
      </label>
      {picked && <AvatarCropper file={picked} onCancel={() => setPicked(null)} onCropped={upload} />}
      {error && <p role="alert" className="mt-1 max-w-40 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function MarkReadButton() {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { await markNotificationsReadAction(); reloadWith(); })}>
      Mark all read
    </Button>
  );
}

function SkillsInput({ initial }: { initial: string[] }) {
  const [skills, setSkills] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,$/, "");
    if (v && !skills.some((s) => s.toLowerCase() === v.toLowerCase()) && skills.length < 15) setSkills([...skills, v.slice(0, 40)]);
    setDraft("");
  };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="p-skills">Skills <span className="font-normal text-muted-foreground">(up to 15)</span></Label>
      <input type="hidden" name="skills" value={skills.join(",")} />
      <div className="flex flex-wrap gap-1.5 rounded-md border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/50">
        {skills.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {s}
            <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="-my-1 -mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-primary/20"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        <input id="p-skills" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } if (e.key === "Backspace" && !draft && skills.length) setSkills(skills.slice(0, -1)); }}
          placeholder={skills.length ? "Add another" : "e.g. Python, UI design, Public speaking"} className="min-h-8 min-w-32 flex-1 bg-transparent px-1 text-base outline-none md:text-sm" />
      </div>
    </div>
  );
}

type Profile = Record<string, unknown>;

/** The member's own profile, in three short sections with one save. */
export function ProfileEditor({ profile, locked }: { profile: Profile; locked: boolean }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bio, setBio] = useState(String(profile.bio ?? ""));
  const v = (k: string) => (profile[k] ? String(profile[k]) : "");
  const skills = ((): string[] => {
    try {
      return JSON.parse(String(profile.skills_json ?? "[]")) as string[];
    } catch {
      return [];
    }
  })();

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`p-${name}`}>{label}</Label>
      <Input id={`p-${name}`} name={name} defaultValue={props.defaultValue as string | undefined ?? ""} aria-invalid={Boolean(errors[name])} {...props} />
      {errors[name] ? <p className="text-xs text-destructive">{errors[name]}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateProfileAction(Object.fromEntries(fd) as Record<string, string>);
      setErrors(res.ok ? {} : res.fields ?? {});
      setMsg(res.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: res.error });
      if (res.ok) reloadWith("Profile saved.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">Basic details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("fullName", "Full name", { defaultValue: v("full_name"), required: true, autoComplete: "name" })}</div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-student">Student ID</Label>
            <Input id="p-student" value={v("student_id") || "Not set"} readOnly disabled />
            <p className="text-xs text-muted-foreground">{locked ? "Fixed after approval. Ask the General Secretary if it's wrong." : "Set when you signed up."}</p>
          </div>
          {field("department", "Department", { defaultValue: v("department"), placeholder: "e.g. CSE" })}
          {field("batch", "Batch", { defaultValue: v("batch"), placeholder: "e.g. 232" })}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">Public profile</legend>
        <p className="-mt-2 text-sm text-muted-foreground">Shown on the executives page while you serve on the committee.</p>
        <div className="grid gap-1.5">
          <Label htmlFor="p-bio">About you</Label>
          <Textarea id="p-bio" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} rows={4} />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/1000</p>
        </div>
        <SkillsInput initial={skills} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field("linkedin", "LinkedIn", { type: "url", defaultValue: v("linkedin_url"), placeholder: "https://linkedin.com/in/…" })}
          {field("github", "GitHub", { type: "url", defaultValue: v("github_url"), placeholder: "https://github.com/…" })}
          {field("facebook", "Facebook", { type: "url", defaultValue: v("facebook_url"), placeholder: "https://facebook.com/…" })}
          {field("twitter", "X", { type: "url", defaultValue: v("twitter_url"), placeholder: "https://x.com/…" })}
          {field("website", "Website or portfolio", { type: "url", defaultValue: v("website_url"), placeholder: "https://…" })}
          {field("publicEmail", "Public email (optional)", { type: "email", defaultValue: v("public_email") }, "Only if you want it shown on the site.")}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">Private</legend>
        {field("phone", "Phone", { type: "tel", defaultValue: v("phone"), autoComplete: "tel" }, "Only club leaders who manage members can see this.")}
      </fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {msg ? <p role="status" className={`text-sm ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p> : <span />}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}

type EmailChoice = { key: string; label: string; hint: string; email: boolean };

/** Which notifications also arrive by email. Security notices always do. */
export function EmailPreferences({ choices, emailOn, address }: { choices: EmailChoice[]; emailOn: boolean; address: string }) {
  return (
    <section id="email" className="scroll-mt-20 rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-base font-semibold">Email notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {emailOn
          ? <>Copies of these notifications go to <span className="font-medium text-foreground">{address}</span>. Security notices (new sign-ins, password or email changes) are always emailed.</>
          : "The club hasn't switched email on yet, so everything arrives in the dashboard only. Your choices apply once it's on."}
      </p>
      <ActionForm action={saveEmailPreferencesAction} submitLabel="Save email choices" successMessage="Saved." className="mt-4 space-y-3">
        <div className="space-y-3">
          {choices.map((c) => (
            <label key={c.key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50">
              <input type="checkbox" name={c.key} defaultChecked={c.email} className="mt-1 h-4 w-4 accent-primary" />
              <span className="text-sm"><span className="font-medium">{c.label}</span><span className="block text-muted-foreground">{c.hint}</span></span>
            </label>
          ))}
        </div>
      </ActionForm>
    </section>
  );
}
