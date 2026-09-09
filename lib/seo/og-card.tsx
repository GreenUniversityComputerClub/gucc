import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";
import { SITE } from "./site";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * Inlines an image from `public/` as a data URI. Satori cannot resolve relative
 * URLs, and reading from disk keeps card rendering free of network round-trips.
 * Returns undefined for anything outside `public/` or any unreadable file.
 */
export function inlinePublicImage(relativePath: string): string | undefined {
  try {
    const decoded = decodeURIComponent(relativePath.split("?")[0]);
    const resolved = path.resolve(
      PUBLIC_DIR,
      `.${path.posix.normalize(`/${decoded}`)}`
    );
    if (!resolved.startsWith(PUBLIC_DIR + path.sep)) return undefined;

    const mime = MIME[path.extname(resolved).toLowerCase()];
    if (!mime) return undefined;

    const bytes = fs.readFileSync(resolved);
    // Well past what a card needs; keeps a stray huge asset from stalling render.
    if (bytes.byteLength > 6_000_000) return undefined;

    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function initialsOf(name: string): string {
  return name
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

const BRAND = "#22c55e";
const INK = "#f8fafc";
const MUTED = "#94a3b8";

export interface OgCardOptions {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Site-relative path or absolute URL of a portrait to composite in. */
  photo?: string;
  variant?: "default" | "portrait";
}

/** Renders the shared GUCC social card. Used by both the static and API routes. */
export function renderOgCard(options: OgCardOptions): ImageResponse {
  const title = (options.title || SITE.name).slice(0, 120);
  const subtitle = (options.subtitle || "").slice(0, 180);
  const eyebrow = (options.eyebrow || SITE.shortName).slice(0, 60);
  const variant = options.variant === "portrait" ? "portrait" : "default";

  const photo = options.photo
    ? /^https?:\/\//i.test(options.photo)
      ? options.photo
      : inlinePublicImage(options.photo)
    : undefined;

  const logo = inlinePublicImage(SITE.logo);
  const hasPortrait = variant === "portrait" && Boolean(photo);
  const titleSize = title.length > 46 ? 60 : title.length > 28 ? 74 : 88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#020617",
          backgroundImage:
            "radial-gradient(1000px 520px at 8% -10%, rgba(34,197,94,0.30), transparent 60%), radial-gradient(760px 480px at 108% 118%, rgba(16,185,129,0.20), transparent 62%)",
          color: INK,
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={64} height={64} alt="" style={{ borderRadius: 16 }} />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.4 }}>
              {SITE.name}
            </span>
            <span style={{ fontSize: 20, color: MUTED }}>
              {SITE.shortName} · Green University of Bangladesh
            </span>
          </div>
        </div>

        {/* Headline, with an optional portrait alongside */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              maxWidth: variant === "portrait" ? 640 : 1056,
            }}
          >
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: BRAND,
                marginBottom: 20,
              }}
            >
              {eyebrow}
            </span>
            <span
              style={{
                fontSize: titleSize,
                fontWeight: 800,
                lineHeight: 1.06,
                letterSpacing: -2,
              }}
            >
              {title}
            </span>
            {subtitle ? (
              <span style={{ fontSize: 32, color: MUTED, marginTop: 22, lineHeight: 1.3 }}>
                {subtitle}
              </span>
            ) : null}
          </div>

          {variant === "portrait" ? (
            <div
              style={{
                display: "flex",
                width: 340,
                height: 340,
                borderRadius: 999,
                overflow: "hidden",
                border: `10px solid ${BRAND}`,
                backgroundColor: "#0f172a",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 120,
                fontWeight: 800,
                color: BRAND,
              }}
            >
              {hasPortrait ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  width={340}
                  height={340}
                  alt=""
                  style={{ objectFit: "cover", width: 340, height: 340 }}
                />
              ) : (
                initialsOf(title)
              )}
            </div>
          ) : null}
        </div>

        {/* Footer rule */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 72,
              height: 6,
              backgroundColor: BRAND,
              borderRadius: 999,
            }}
          />
          <span style={{ fontSize: 24, color: MUTED }}>gucc.green.edu.bd</span>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
