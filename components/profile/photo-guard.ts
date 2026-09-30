"use client";

import { checkPhoto } from "@/lib/media/photo-quality";
import type { ConfirmOptions } from "@/components/ui/confirm-dialog";

type Confirm = (o: ConfirmOptions) => Promise<boolean>;

/**
 * Decide whether a picture may be used as a profile or group photo, asking the person when it
 * only looks doubtful. `picked`: the file they chose (everything is checked, warnings ask "Use
 * anyway?"). `framed`: the square they framed (only blank results are refused: framing may land
 * on an empty area).
 */
export async function vetPhoto(file: File | Blob, opts: { kind: "profile" | "group"; stage: "picked" | "framed"; confirm?: Confirm }): Promise<{ ok: true } | { ok: false; error: string | null }> {
  const c = await checkPhoto(file, { kind: opts.kind });
  if (c.verdict === "block") {
    if (opts.stage === "framed" && c.reasons.every((r) => r === "too-small")) return { ok: true };
    return {
      ok: false,
      error: opts.stage === "framed" && opts.kind === "profile"
        ? "The part you framed looks blank. Move or zoom so your face fills the circle."
        : c.message,
    };
  }
  if (c.verdict === "warn" && opts.stage === "picked" && opts.confirm) {
    const go = await opts.confirm({ title: opts.kind === "group" ? "Use this picture?" : "Use this photo?", description: c.message ?? undefined, confirmLabel: "Use anyway", cancelLabel: "Choose another" });
    return go ? { ok: true } : { ok: false, error: null };
  }
  return { ok: true };
}
