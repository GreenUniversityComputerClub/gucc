/**
 * The two switches that protect the club's free plans, and email set-up.
 *
 *   media.uploads_enabled   switched off by the hourly free-tier guard near R2's free limits
 *   email.enabled           off until a test email has really arrived
 *
 * Anyone who can see System health may switch either one OFF at once (a brake is always safe).
 * Switching ON is a protected change: a Moderator does it, confirmed by another Moderator when
 * there is one, and email needs a successful test from the last 7 days first.
 */
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import { siteUrl, type Ctx } from "../context";
import { nowIso } from "../db";
import { emailProvider, forgetEmailSettings, lastSuccessfulTest, sendEmail, TEST_VALID_DAYS } from "../email";
import { EMAIL_CATEGORIES, type EmailCategory } from "../email-outbox";
import { AppError, ForbiddenError, ValidationError } from "../errors";
import { limit } from "../limits";
import { requireRecentAuth } from "../security";
import { updateSystemSetting } from "./governance";

export const SWITCHES = ["media.uploads_enabled", "email.enabled"] as const;

export async function setSwitch(ctx: Ctx, key: string, on: boolean): Promise<{ applied: boolean; message: string }> {
  const actor = requireActor(ctx);
  if (!(SWITCHES as readonly string[]).includes(key)) throw new ValidationError("Unknown switch.");
  const name = key === "email.enabled" ? "Email" : "Uploads";
  if (!on) {
    if (!can(ctx, "system.health") && !can(ctx, "settings.system")) throw new ForbiddenError("Only people who can see System health can use this switch.");
    await requireRecentAuth(ctx);
    const row = await ctx.db.first<{ value_json: string }>("SELECT value_json FROM system_settings WHERE key = ?1", key);
    if (row?.value_json === "false") return { applied: true, message: `${name} is already off.` };
    await ctx.db.batch([
      ctx.db.stmt("UPDATE system_settings SET value_json = 'false', updated_at = ?2, updated_by = ?3 WHERE key = ?1", key, nowIso(), actor.user.id),
      auditStmt(ctx, { action: "system.switch_off", resourceType: "system_setting", resourceId: key, before: { value: row ? JSON.parse(row.value_json) : null }, after: { value: false } }),
    ]);
    if (key === "email.enabled") forgetEmailSettings(ctx);
    return { applied: true, message: `${name} switched off.` };
  }
  requirePermission(ctx, "settings.system");
  await requireRecentAuth(ctx);
  if (key === "email.enabled") {
    const provider = emailProvider(ctx);
    if (!provider || provider.name === "console") throw new AppError(409, "EMAIL_NOT_CONFIGURED", "SMTP2GO isn't configured on the API yet (the SMTP2GO_API_KEY secret and the EMAIL_FROM variable).");
    if (!(await lastSuccessfulTest(ctx))) throw new AppError(409, "EMAIL_NOT_TESTED", `Send a test email first and check that it arrived (a test counts for ${TEST_VALID_DAYS} days).`);
  }
  const result = await updateSystemSetting(ctx, key, "true");
  if (key === "email.enabled") forgetEmailSettings(ctx);
  return result.applied
    ? { applied: true, message: `${name} switched on.` }
    : { applied: false, message: `Another Moderator needs to approve switching ${name.toLowerCase()} on. It's in Approvals.` };
}

/** A real message to the leader's own address, through SMTP2GO, even while email is off. */
export async function sendTestEmail(ctx: Ctx): Promise<{ ok: boolean; message: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "settings.system");
  await requireRecentAuth(ctx);
  await limit(ctx, "email.test", actor.user.id);
  const provider = emailProvider(ctx);
  if (!provider) throw new AppError(409, "EMAIL_NOT_CONFIGURED", "No email provider is configured on the API (the SMTP2GO_API_KEY secret and the EMAIL_FROM variable). Nothing was sent.");
  const base = siteUrl(ctx);
  const result = await sendEmail(ctx, {
    to: actor.user.email,
    subject: "GUCC test email",
    text: `This is a test from the GUCC dashboard (${base || "the club website"}).\n\nIf you can read this, email works: go back to System health and switch email on.\n\nSent at ${new Date().toUTCString()}.`,
  }, { type: "test", userId: actor.user.id, force: true });
  await auditStmt(ctx, { action: "email.test", resourceType: "system_setting", resourceId: "email.enabled", after: { ok: result.ok, provider: provider.name, error: result.error ?? null }, decision }).run();
  // A refusal shows as an error on the form, with SMTP2GO's own words.
  if (!result.ok) throw new AppError(409, "EMAIL_FAILED", `Not sent. ${result.error ?? ""}`.trim());
  if (provider.name === "console") return { ok: true, message: "Development mode: the message was printed to the API log." };
  return { ok: true, message: `SMTP2GO accepted the message${result.id ? ` (id ${result.id})` : ""}. Check ${actor.user.email}, including spam; switch email on only once it has arrived.` };
}

// ───────────────────────────── personal email choices ─────────────────────────────

export async function emailPreferences(ctx: Ctx) {
  const actor = requireActor(ctx);
  const rows = await ctx.db.all<{ category: string; email: number }>("SELECT category, email FROM notification_preferences WHERE user_id = ?1", actor.user.id);
  const choices = (Object.keys(EMAIL_CATEGORIES) as EmailCategory[]).map((key) => {
    const row = rows.find((r) => r.category === key);
    return { key, label: EMAIL_CATEGORIES[key].label, hint: EMAIL_CATEGORIES[key].hint, email: row ? row.email === 1 : EMAIL_CATEGORIES[key].default };
  });
  const on = await ctx.db.value<string>("SELECT value_json FROM system_settings WHERE key = 'email.enabled'");
  return { choices, emailOn: on === "true" && Boolean(emailProvider(ctx) && emailProvider(ctx)!.name !== "console"), address: actor.user.email };
}

export async function saveEmailPreferences(ctx: Ctx, input: Record<string, unknown>): Promise<{ message: string }> {
  const actor = requireActor(ctx);
  const values = (Object.keys(EMAIL_CATEGORIES) as EmailCategory[]).map((key) => ({ c: key, e: input[key] === true || input[key] === "on" || input[key] === "true" ? 1 : 0 }));
  const now = nowIso();
  await ctx.db.run(
    `INSERT INTO notification_preferences (user_id, category, email, updated_at)
     SELECT ?1, json_extract(j.value, '$.c'), json_extract(j.value, '$.e'), ?3 FROM json_each(?2) AS j WHERE true
     ON CONFLICT(user_id, category) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`,
    actor.user.id, JSON.stringify(values), now);
  return { message: "Saved. Security notices are always emailed." };
}
