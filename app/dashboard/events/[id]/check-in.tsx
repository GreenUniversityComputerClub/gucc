"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { checkInAction } from "./event-tools";

type Result = { ok: boolean; text: string };
type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };

/**
 * Check people in at the door: point the camera at the QR code on their phone (browsers with
 * built-in QR reading), or type the code under it. A code scanned twice just says "already in".
 */
export function CheckInScanner({ eventId, onDone }: { eventId: string; onDone?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    setCanScan(typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function submit(value: string) {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    const r = await checkInAction(eventId, v).catch(() => null);
    setBusy(false);
    if (!r) return setResult({ ok: false, text: "Couldn't reach the server. Try again." });
    if (!r.ok) return setResult({ ok: false, text: r.error });
    navigator.vibrate?.(r.data.already ? [40, 60, 40] : 60);
    setResult({ ok: true, text: r.data.already ? `${r.data.name} is already checked in.` : `${r.data.name} checked in.` });
    setCode("");
    onDone?.();
  }

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.current = s;
      setScanning(true);
      requestAnimationFrame(async () => {
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
        const detector = new (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (!stream.current || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const value = found[0]?.rawValue;
            // The same code is read many times a second: act on it once every few seconds.
            if (value && (last.current?.code !== value || Date.now() - last.current.at > 4000)) {
              last.current = { code: value, at: Date.now() };
              await submit(value);
            }
          } catch { /* keep scanning */ }
          if (stream.current) setTimeout(tick, 350);
        };
        void tick();
      });
    } catch {
      setResult({ ok: false, text: "The camera isn't available. Type the code instead." });
    }
  }

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setScanning(false);
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Check in at the door</h3>
        {canScan && (
          <Button type="button" variant={scanning ? "outline" : "default"} className="min-h-10 gap-1.5" onClick={scanning ? stop : start}>
            {scanning ? <CameraOff className="h-4 w-4" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}{scanning ? "Stop camera" : "Scan QR codes"}
          </Button>
        )}
      </div>
      {scanning && (
        <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="h-full w-full object-cover" aria-label="Camera" />
          <span className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" aria-hidden />
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void submit(code); }} className="flex gap-2">
        <label className="sr-only" htmlFor="checkin-code">Check-in code</label>
        <input id="checkin-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Type or paste the code under their QR" autoComplete="off"
          className="h-10 flex-1 rounded-md border bg-background px-3 font-mono text-base md:text-sm" />
        <Button type="submit" className="min-h-10" disabled={busy || !code.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Checking" /> : "Check in"}</Button>
      </form>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
          {result.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}{result.text}
        </p>
      )}
    </div>
  );
}
