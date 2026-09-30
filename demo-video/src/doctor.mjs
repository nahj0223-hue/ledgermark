import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { chromiumPath, ffmpegPath } from './lib/env.mjs';

const checks = [];
function record(name, fn) {
  try {
    checks.push({ name, ok: true, detail: fn() });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
  }
}

record('chromium binary', () => chromiumPath());
record('ffmpeg binary', () => ffmpegPath());
record('ffmpeg runs', () =>
  execFileSync(ffmpegPath(), ['-version'], { encoding: 'utf8' }).split('\n')[0],
);
record('libx264 encoder', () => {
  const out = execFileSync(ffmpegPath(), ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (!/\slibx264\s/.test(out)) throw new Error('libx264 missing from this ffmpeg build');
  return 'available';
});

const browser = await chromium.launch({ executablePath: chromiumPath() });
checks.push({ name: 'chromium launches', ok: true, detail: browser.version() });
await browser.close();

for (const { name, ok, detail } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${detail}`);
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
