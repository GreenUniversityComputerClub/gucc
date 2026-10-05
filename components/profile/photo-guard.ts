"use client";

import { checkPhoto } from "@/lib/media/photo-quality";
import { personShare } from "@/lib/media/background";
import type { ConfirmOptions } from "@/components/ui/confirm-dialog";

type Confirm = (o: ConfirmOptions) => Promise<boolean>;

/** Reasons the person-finder may overturn (colour statistics, not size or a broken file). */
const DOUBTFUL = new Set(["blank", "placeholder", "transparent"]);

/**
 * Decide whether a picture may be used as a profile or group photo, asking the person when it
 * only looks doubtful. `picked`: the file they chose (everything is checked, warnings ask "Use
 * anyway?"). `framed`: the square they framed (only blank results are refused: framing may land
 * on an empty area). Before a profile photo is refused as blank, the person-finder (the same one
 * the background remover uses, on this device) is asked: a person in the picture wins.
 */
export async function vetPhoto(file: File | Blob, opts: { kind: "profile" | "group"; stage: "picked" | "framed"; confirm?: Confirm }): Promise<{ ok: true } | { ok: false; error: string | null }> {
  let c = await checkPhoto(file, { kind: opts.kind });
  if (c.verdict === "block" && opts.kind === "profile" && c.reasons.length > 0 && c.reasons.every((r) => DOUBTFUL.has(r))) {
    const person = await personShare(file);
    if (person !== null) c = await checkPhoto(file, { kind: opts.kind, person });
  }
  if (c.verdict === "block") {
    // Framing can only make a picture blank (an empty corner); its size was checked when picked.
    if (opts.stage === "framed" && !c.reasons.some((r) => r === "blank" || r === "transparent")) return { ok: true };
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
