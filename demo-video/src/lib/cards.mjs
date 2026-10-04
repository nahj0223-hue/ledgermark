import { readFile } from 'node:fs/promises';
import { fontFiles } from './env.mjs';

let fontCssPromise;

/**
 * Inline the woff2 files as data URIs rather than linking them with file:// URLs —
 * Chromium refuses cross-origin font loads from the about:blank / data: documents these
 * cards are rendered in, and a silently unloaded font means Hangul renders as tofu.
 */
async function fontCss() {
  fontCssPromise ??= (async () => {
    const files = fontFiles();
    const faces = await Promise.all(
      Object.entries(files).map(async ([weight, path]) => {
        const base64 = (await readFile(path)).toString('base64');
        return `@font-face{font-family:'Pretendard';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${base64}) format('woff2')}`;
      }),
    );
    return faces.join('');
  })();
  return fontCssPromise;
}

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%}
body{
  font-family:'Pretendard',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  font-feature-settings:'tnum' 1;
  letter-spacing:-0.02em;
  /* Korean must wrap at word boundaries; the default breaks mid-word ("변조 불가/능한"). */
  word-break:keep-all;
  overflow-wrap:break-word;
}
.stage{
  width:100%;height:100%;
  display:flex;flex-direction:column;justify-content:center;
  padding:0 clamp(80px,9vw,180px);
  background:var(--bg);color:var(--fg);
}
.eyebrow{
  font-weight:600;font-size:22px;letter-spacing:0.18em;text-transform:uppercase;
  color:var(--accent);margin-bottom:28px;
}
.headline{font-weight:700;font-size:96px;line-height:1.1;text-wrap:balance}
.sub{font-weight:400;font-size:34px;line-height:1.5;color:var(--muted);margin-top:32px;max-width:34ch}
.rule{height:3px;width:120px;background:var(--accent);margin-top:48px}
.index{
  position:absolute;right:clamp(80px,9vw,180px);bottom:72px;
  font-weight:600;font-size:24px;color:var(--muted);font-variant-numeric:tabular-nums;
}
.logo{position:absolute;left:clamp(80px,9vw,180px);top:72px;height:44px;width:auto;opacity:.95}
/* A product photo fills the frame; the text sits on a scrim so it stays readable over
   whatever the photo happens to be. Investors read a physical product as evidence that
   the software is attached to something real, which no screen recording can supply. */
.photo{position:absolute;inset:0;z-index:0}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.photo::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg,var(--bg) 0%,rgba(11,13,16,.88) 46%,rgba(11,13,16,.42) 100%);
}
/* The stage paints an opaque background, which would bury the photo behind it. */
body.photo-card .stage{background:transparent;position:relative;z-index:1}
body.photo-card .index{z-index:1}
body.photo-card .logo{z-index:1}
body.photo-card .sub{max-width:28ch}
/* Lower third: transparent so ffmpeg can overlay it on live screen footage. */
body.caption{background:transparent}
.lower{
  position:absolute;left:96px;bottom:96px;max-width:1100px;
  background:var(--scrim);backdrop-filter:blur(18px);
  border-left:4px solid var(--accent);
  padding:26px 36px;border-radius:2px;
}
.lower .t{font-weight:700;font-size:44px;line-height:1.2;color:#fff}
.lower .s{font-weight:400;font-size:26px;line-height:1.45;color:rgba(255,255,255,.76);margin-top:10px}
`;

/** Restrained near-black ground; replace these with LedgerMark brand tokens once known. */
const THEME = {
  '--bg': '#0B0D10',
  '--fg': '#F4F5F7',
  '--muted': 'rgba(244,245,247,.62)',
  '--accent': '#4ADE80',
  '--scrim': 'rgba(11,13,16,.78)',
};

function themeCss(overrides = {}) {
  const merged = { ...THEME, ...overrides };
  return `:root{${Object.entries(merged).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

async function document(bodyClass, inner, theme) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${await fontCss()}${themeCss(theme)}${BASE_CSS}</style></head><body class="${bodyClass}">${inner}</body></html>`;
}

/**
 * Full-frame card used for the opening title, section dividers and the closing slate.
 * `index` renders a small "03 / 06" marker so a reviewer can cite a moment in the cut.
 */
export async function cardHtml({ eyebrow, headline, sub, index, theme, logo, image }) {
  const parts = [
    eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : '',
    `<h1 class="headline">${escapeHtml(headline)}</h1>`,
    sub ? `<p class="sub">${escapeHtml(sub)}</p>` : '',
    '<div class="rule"></div>',
  ].join('');
  const marker = index ? `<div class="index">${escapeHtml(index)}</div>` : '';
  // `logo` and `image` arrive already inlined as data URIs — see lib/assets.mjs.
  const mark = logo ? `<img class="logo" src="${logo}" alt="">` : '';
  const photo = image ? `<div class="photo"><img src="${image}" alt=""></div>` : '';
  return document(
    `card${image ? ' photo-card' : ''}`,
    `${photo}${mark}<div class="stage">${parts}</div>${marker}`,
    theme,
  );
}

/** Transparent lower-third burned over the live screen recording. */
export async function captionHtml({ text, sub, theme }) {
  const inner = `<div class="lower"><div class="t">${escapeHtml(text)}</div>${
    sub ? `<div class="s">${escapeHtml(sub)}</div>` : ''
  }</div>`;
  return document('caption', inner, theme);
}
