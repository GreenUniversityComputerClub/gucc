/**
 * The one look every GUCC email shares: a light, mobile-friendly layout built from tables and
 * inline styles (what Gmail, Outlook and Apple Mail all render), with the club's name, a clear
 * button for the main link and a footer that says why it was sent. Every value is escaped here;
 * callers pass plain text.
 */
import { escapeHtml } from "../html";

export interface EmailLayout {
  /** Shown in the inbox list next to the subject (not in the message). */
  preheader?: string;
  /** A small label above the heading ("Club announcement"). */
  kicker?: string;
  /** Big first line. */
  heading?: string;
  /** Paragraphs of plain text (line breaks kept; web addresses become links). */
  paragraphs?: string[];
  /** The main thing to do. */
  action?: { label: string; url: string };
  /** A list of items (a digest). */
  items?: Array<{ title: string; body?: string | null; url: string }>;
  /** Small print under the list or button (e.g. "…and 3 more"). */
  after?: { text: string; url?: string } | null;
  /** Why this was sent, and where to change it. */
  footer: string[];
  /** The site's address, for the logo. */
  site: string;
}

const GREEN = "#15803d";
const INK = "#0f172a";
const MUTED = "#475569";

/** Plain text with web addresses made clickable (the addresses are escaped first). */
function linked(text: string): string {
  return escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:${GREEN};word-break:break-all">${url}</a>`);
}

export function renderEmail(l: EmailLayout): string {
  const site = l.site.replace(/\/+$/, "");
  const logo = /^https:\/\//.test(site) ? `${site}/android-chrome-192x192.png` : null;
  const para = (t: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};white-space:pre-line">${linked(t)}</p>`;
  const button = l.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px"><tr><td style="border-radius:10px;background:${GREEN}">
<a href="${escapeHtml(l.action.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(l.action.label)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:${MUTED}">If the button doesn't work, open this link:<br><a href="${escapeHtml(l.action.url)}" style="color:${GREEN};word-break:break-all">${escapeHtml(l.action.url)}</a></p>`
    : "";
  const items = (l.items ?? []).map((it) => `<tr><td style="padding:0 0 10px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:12px 14px">
<a href="${escapeHtml(it.url)}" style="font-size:15px;font-weight:600;color:${INK};text-decoration:none">${escapeHtml(it.title)}</a>
${it.body ? `<div style="margin-top:4px;font-size:14px;line-height:1.5;color:${MUTED};white-space:pre-line">${escapeHtml(it.body)}</div>` : ""}
<div style="margin-top:6px"><a href="${escapeHtml(it.url)}" style="font-size:13px;font-weight:600;color:${GREEN};text-decoration:none">Open &rarr;</a></div>
</td></tr></table></td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(l.heading ?? "Green University Computer Club")}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
${l.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="padding:0 4px 14px">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
${logo ? `<td style="padding-right:10px"><img src="${escapeHtml(logo)}" width="36" height="36" alt="" style="display:block;border-radius:50%"></td>` : ""}
<td style="font-size:14px;font-weight:700;letter-spacing:.02em;color:${GREEN}">GREEN UNIVERSITY<br><span style="color:${INK};font-size:12px;letter-spacing:.08em">COMPUTER CLUB</span></td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border-radius:14px;padding:28px 24px;border:1px solid #e2e8f0">
${l.kicker ? `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${GREEN}">${escapeHtml(l.kicker)}</p>` : ""}
${l.heading ? `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:${INK}">${escapeHtml(l.heading)}</h1>` : ""}
${(l.paragraphs ?? []).filter(Boolean).map(para).join("\n")}
${button}
${items ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${items}</table>` : ""}
${l.after ? `<p style="margin:6px 0 0;font-size:14px">${l.after.url ? `<a href="${escapeHtml(l.after.url)}" style="color:${GREEN}">${escapeHtml(l.after.text)}</a>` : escapeHtml(l.after.text)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.6;color:${MUTED}">
${l.footer.map((f) => linked(f)).join("<br>")}
</td></tr>
</table></td></tr></table></body></html>`;
}
