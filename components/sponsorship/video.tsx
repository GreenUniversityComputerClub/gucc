"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { videoEmbed } from "@/lib/sponsorship/sections";

/**
 * A video that loads only when played (no third-party requests or cookies until then): the
 * YouTube thumbnail, or a plain panel for Vimeo, with a play button.
 */
export function VideoFacade({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const v = videoEmbed(url);
  if (!v) return null;
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border bg-black shadow-lg">
      {playing ? (
        <iframe src={v.src} title={title} className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring" aria-label={`Play video: ${title}`}>
          {v.provider === "youtube" && (
            // eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail, shown before the video loads
            <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
          )}
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-xl transition-transform group-hover:scale-110">
            <Play className="ml-1 h-7 w-7" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
