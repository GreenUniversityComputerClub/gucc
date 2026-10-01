"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarCropper } from "@/components/profile/avatar-cropper";
import { vetPhoto } from "@/components/profile/photo-guard";
import { uploadImage } from "@/lib/media/client";
import { useSoftRefresh } from "@/lib/soft-refresh";
import { ActionForm } from "@/components/admin/ui";
import { saveEmailPreferencesAction, setAvatarAction, updateProfileAction } from "./actions";
import { initials } from "@/lib/initials";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { refreshSession } from "@/lib/api/use-session";

/**
 * Profile photo: framed in the browser, uploaded to R2 through the API, then set on the profile.
 * It shows everywhere at once (executives page, messages, notifications, member lists), and the
 * navbar picture updates without a reload. Visible buttons, so it works the same on touch screens.
 */
export function AvatarUploader({ url, name, canUpload }: { url: string | null; name: string; canUpload: boolean }) {
  const [busy, setBusy] = useState<"check" | "upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const refresh = useSoftRefresh();
  const input = useRef<HTMLInputElement>(null);
  const letters = initials(name);

  /** A blank, placeholder or tiny picture is refused before anything is uploaded. */
  async function pick(file: File) {
    setError(null);
    setBusy("check");
    const v = await vetPhoto(file, { kind: "profile", stage: "picked", confirm });
    setBusy(null);
    if (!v.ok) return setError(v.error);
    setPicked(file);
  }

  async function upload(file: File, cutout?: File) {
    setPicked(null);
    setBusy("upload");
    setError(null);
    const framed = await vetPhoto(file, { kind: "profile", stage: "framed" });
    if (!framed.ok) {
      setBusy(null);
      return setError(framed.error);
    }
    // The cut-out (background removed) is a nicety for the executives list: without it, the photo still saves.
    const [up, cut] = await Promise.all([uploadImage(file, { purpose: "avatar" }), cutout ? uploadImage(cutout, { purpose: "avatar" }) : Promise.resolve(null)]);
    const res = up.ok ? await setAvatarAction(up.id, cut?.ok ? cut.id : null) : null;
    setBusy(null);
    if (!up.ok) setError(up.error);
    else if (res && !res.ok) setError(res.error);
    else {
      void refreshSession();
      refresh("Photo updated. It now shows everywhere on the site.");
    }
  }

  async function remove() {
    if (!(await confirm({ title: "Remove your photo?", description: "Your initials show instead, everywhere on the site.", confirmLabel: "Remove", destructive: true }))) return;
    setBusy("remove");
    setError(null);
    const res = await setAvatarAction(null);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      void refreshSession();
      refresh("Photo removed.");
    }
  }

  const status = busy === "upload" ? "Uploading…" : busy === "check" ? "Checking…" : busy === "remove" ? "Removing…" : null;
  return (
    <div className="flex shrink-0 flex-col items-center gap-2.5">
      {confirmDialog}
      {/* The photo is the button: a ring in the club's green, and a camera on hover or focus. */}
      <div className="rounded-full bg-linear-to-br from-emerald-400 via-primary to-teal-600 p-[3px] shadow-lg shadow-primary/15">
        <div className="rounded-full bg-card p-[3px]">
        <button type="button" onClick={() => canUpload && input.current?.click()} disabled={!canUpload || Boolean(busy)}
          aria-label={canUpload ? (url ? "Change your photo" : "Add your photo") : "Your photo"}
          className="group relative block h-24 w-24 overflow-hidden rounded-full bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default sm:h-28 sm:w-28">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center bg-muted text-muted-foreground">
              <span className="text-2xl font-semibold">{letters}</span>
              {canUpload && <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">Add photo</span>}
            </span>
          )}
          {canUpload && !busy && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/55 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
              <Camera className="h-5 w-5" />{url ? "Change" : "Add"}
            </span>
          )}
          {status && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-medium text-white" role="status">{status}</span>}
        </button>
        </div>
      </div>
      {canUpload && (
        <div className="flex gap-1">
          <button type="button" onClick={() => input.current?.click()} disabled={Boolean(busy)}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Camera className="h-3.5 w-3.5" aria-hidden />{url ? "Change photo" : "Add photo"}
          </button>
          {url && (
            <button type="button" onClick={remove} disabled={Boolean(busy)}
              className="inline-flex min-h-9 items-center rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Remove
            </button>
          )}
          <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden disabled={Boolean(busy)} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pick(f);
          }} />
        </div>
      )}
      {picked && <AvatarCropper file={picked} onCancel={() => setPicked(null)} onCropped={upload} backgrounds />}
      {error && <p role="alert" className="max-w-56 text-center text-xs text-destructive">{error}</p>}
    </div>
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
  const refresh = useSoftRefresh();
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
      // The page (completeness, your page's link) updates in place; the saved text stays in the form.
      if (res.ok) refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">Basic details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("fullName", "Full name", { defaultValue: v("full_name"), required: true, autoComplete: "name" })}</div>
          {locked ? (
            <div className="grid gap-1.5">
              <Label htmlFor="p-student">Student ID</Label>
              <Input id="p-student" value={v("student_id") || "Not set"} readOnly disabled />
              <p className="text-xs text-muted-foreground">Fixed after approval. Ask the General Secretary if it&apos;s wrong.</p>
            </div>
          ) : field("studentId", "Student ID", { defaultValue: v("student_id"), inputMode: "numeric", maxLength: 9, placeholder: "9 digits" }, "You can correct it until your application is approved.")}
          {field("department", "Department", { defaultValue: v("department"), placeholder: "e.g. CSE" })}
          {field("batch", "Batch", { defaultValue: v("batch"), placeholder: "e.g. 232" })}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">Your profile page</legend>
        <p className="-mt-2 text-sm text-muted-foreground">
          Other members can visit your profile page{v("handle") ? <> (<Link prefetch={false} href={`/members/${v("handle")}`} className="underline">see how it looks</Link>)</> : null}. Your phone, student ID and sign-in email are never shown there.
        </p>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Who can see it</legend>
          {[
            ["MEMBERS", "Signed-in members", "Approved GUCC members can see your bio, skills, links and batch."],
            ["PUBLIC", "Everyone", "Anyone on the internet, and search engines."],
            ["PRIVATE", "Only me", "Hidden from the members directory. If you serve on a committee, your name, photo, position and links stay on the executives page."],
          ].map(([value, label, hint]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              {/* The option's name is its title; the explanation is read as its description. */}
              <input type="radio" name="visibility" value={value} defaultChecked={(v("visibility") || "MEMBERS") === value} className="mt-1 h-4 w-4"
                aria-labelledby={`vis-${value}`} aria-describedby={`vis-${value}-hint`} />
              <span className="text-sm"><span id={`vis-${value}`} className="font-medium">{label}</span><span id={`vis-${value}-hint`} className="block text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </fieldset>
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

/** Which notifications also arrive by email: none until the member turns them on. */
export function EmailPreferences({ choices, emailOn, address }: { choices: EmailChoice[]; emailOn: boolean; address: string }) {
  return (
    <section id="email" className="scroll-mt-20 rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-base font-semibold">Email notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {emailOn
          ? <>Every notification arrives in the dashboard. Tick what you also want by email, to <span className="font-medium text-foreground">{address}</span>; nothing is emailed until you do. Account emails (verification, password reset) always come.</>
          : "Email is switched off for the club right now, so everything arrives in the dashboard only. Your choices apply once it's back on."}
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
