import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(HERE, '..', '..');

const BROWSERS_ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';

/**
 * Chromium and ffmpeg ship pre-installed under PLAYWRIGHT_BROWSERS_PATH in cloud
 * sessions, but the build numbers move independently of the npm package version.
 * Resolve by scanning the directory so a browser bump never breaks recording.
 */
function findBuild(prefix, ...relativeCandidates) {
  if (!existsSync(BROWSERS_ROOT)) return null;
  const builds = readdirSync(BROWSERS_ROOT)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .reverse();
  for (const build of builds) {
    for (const relative of relativeCandidates) {
      const candidate = join(BROWSERS_ROOT, build, relative);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function chromiumPath() {
  const resolved =
    process.env.LEDGERMARK_CHROMIUM ||
    findBuild('chromium-', 'chrome-linux/chrome') ||
    findBuild('chromium_headless_shell-', 'chrome-linux/headless_shell');
  if (!resolved) {
    throw new Error(
      `Chromium not found under ${BROWSERS_ROOT}. Set LEDGERMARK_CHROMIUM to an executable.`,
    );
  }
  return resolved;
}

/**
 * The ffmpeg bundled with Playwright only carries VP8 and PNG — enough for its own
 * webm recording, but it cannot produce the H.264 mp4 that slide decks and IR pitch
 * software expect. ffmpeg-static is the full build, so prefer it and keep the bundled
 * one only as a last resort.
 */
export function ffmpegPath() {
  if (process.env.LEDGERMARK_FFMPEG) return process.env.LEDGERMARK_FFMPEG;
  const staticBuild = join(PKG_ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg');
  if (existsSync(staticBuild)) return staticBuild;
  const bundled = findBuild('ffmpeg-', 'ffmpeg-linux', 'ffmpeg');
  if (bundled) return bundled;
  throw new Error(
    'ffmpeg not found. Run `npm install` in demo-video/, or set LEDGERMARK_FFMPEG.',
  );
}

/** Pretendard is the de-facto Korean UI typeface; weights come from the npm package. */
export function fontFiles() {
  const dir = join(PKG_ROOT, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2');
  const weights = { 400: 'Pretendard-Regular.woff2', 600: 'Pretendard-SemiBold.woff2', 700: 'Pretendard-Bold.woff2' };
  const resolved = {};
  for (const [weight, file] of Object.entries(weights)) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      throw new Error(`Font ${file} missing. Run \`npm install\` in demo-video/.`);
    }
    resolved[weight] = path;
  }
  return resolved;
}
