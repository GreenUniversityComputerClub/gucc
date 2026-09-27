"use server";

import QRCode from "qrcode";
import { rpc, runAction } from "@/lib/api/session";

export async function startMfaAction() {
  const r = await rpc<{ secret: string; uri: string }>("account.mfaStart");
  if (!r.ok) return { ok: false as const, error: r.error };
  // The QR code is drawn here, so the secret never goes to a third-party service.
  const svg = await QRCode.toString(r.data.uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { ok: true as const, secret: r.data.secret, uri: r.data.uri, svg };
}

export async function confirmMfaAction(code: string) {
  return runAction<{ recoveryCodes: string[] }>("account.mfaConfirm", { code });
}

export async function newRecoveryCodesAction(code: string) {
  return runAction<{ recoveryCodes: string[] }>("account.mfaRecoveryCodes", { code });
}

export async function disableMfaAction(fd: FormData) {
  return runAction("account.mfaDisable", { password: String(fd.get("password") ?? ""), code: String(fd.get("code") ?? "") }, { message: "Two-factor sign-in is off." });
}
