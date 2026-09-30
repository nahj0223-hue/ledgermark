/**
 * Recorded scenes + manifest -> one IR-ready mp4.
 *
 * Captions are burned in here rather than during recording so the wording can be rewritten
 * for a different investor without re-running the app.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumPath } from './lib/env.mjs';
import { cardHtml, captionHtml } from './lib/cards.mjs';
import { ffmpeg, VIDEO_ARGS } from './lib/ffmpeg.mjs';

const FADE = 0.4;
const CAPTION_FADE = 0.3;

function parseArgs(argv) {
  const [takeDir, ...rest] = argv;
  if (!takeDir) throw new Error('Usage: node src/produce.mjs <take-dir> [--out <file.mp4>]');
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--')) throw new Error(`Unexpected argument "${rest[i]}"`);
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  return { takeDir: resolve(takeDir), out: resolve(flags.out ?? join(takeDir, 'ledgermark-ir-demo.mp4')) };
}

async function renderPngs(manifest, workDir) {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage({ viewport: manifest.viewport });
  const paths = { cards: {}, captions: {} };

  const shoot = async (html, file, transparent) => {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, omitBackground: transparent });
  };

  const cardScenes = manifest.scenes.filter((s) => s.kind === 'card');
  for (const [i, scene] of cardScenes.entries()) {
    const file = join(workDir, `card-${scene.id}.png`);
    const html = await cardHtml({
      ...scene.card,
      index: scene.card.index ?? `${String(i + 1).padStart(2, '0')} / ${String(cardScenes.length).padStart(2, '0')}`,
      theme: manifest.theme,
    });
    await shoot(html, file, false);
    paths.cards[scene.id] = file;
  }

  for (const scene of manifest.scenes.filter((s) => s.kind === 'screen')) {
    paths.captions[scene.id] = [];
    for (const [i, caption] of scene.captions.entries()) {
      const file = join(workDir, `cap-${scene.id}-${i}.png`);
      await shoot(await captionHtml({ ...caption, theme: manifest.theme }), file, true);
      paths.captions[scene.id].push(file);
    }
  }

  await browser.close();
  return paths;
}

async function buildCardSegment(scene, pngPath, fps, out) {
  const seconds = scene.seconds;
  await ffmpeg([
    '-loop', '1', '-t', String(seconds), '-i', pngPath,
    '-vf', `fps=${fps},fade=t=in:st=0:d=${FADE},fade=t=out:st=${(seconds - FADE).toFixed(3)}:d=${FADE},format=yuv420p`,
    ...VIDEO_ARGS, '-an', out,
  ], { label: `card ${scene.id}` });
}

async function buildScreenSegment(scene, captionPngs, fps, takeDir, out) {
  const inputs = ['-i', join(takeDir, scene.file)];
  const filters = [`[0:v]fps=${fps},format=rgba[base0]`];

  scene.captions.forEach((caption, i) => {
    // Clamp so a caption written past the end of a shortened take cannot desync the overlay.
    const start = Math.max(0, Math.min(caption.start, Math.max(0, scene.seconds - 0.5)));
    const duration = Math.min(caption.duration, Math.max(0.6, scene.seconds - start));
    const end = start + duration;
    const idx = i + 1;

    inputs.push('-loop', '1', '-t', String(duration), '-i', captionPngs[i]);
    filters.push(
      `[${idx}:v]format=rgba,fade=t=in:st=0:d=${CAPTION_FADE}:alpha=1,` +
        `fade=t=out:st=${Math.max(0, duration - CAPTION_FADE).toFixed(3)}:d=${CAPTION_FADE}:alpha=1,` +
        `setpts=PTS+${start.toFixed(3)}/TB[cap${idx}]`,
      `[base${i}][cap${idx}]overlay=0:0:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[base${idx}]`,
    );
  });

  const last = `base${scene.captions.length}`;
  filters.push(`[${last}]format=yuv420p[vout]`);

  await ffmpeg([
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    ...VIDEO_ARGS, '-an', out,
  ], { label: `scene ${scene.id}` });
}

async function main() {
  const { takeDir, out } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(join(takeDir, 'manifest.json'), 'utf8'));
  const workDir = join(takeDir, '.work');
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(dirname(out), { recursive: true });

  const pngs = await renderPngs(manifest, workDir);

  const segments = [];
  for (const scene of manifest.scenes) {
    const segment = join(workDir, `seg-${scene.id}.mp4`);
    if (scene.kind === 'card') {
      await buildCardSegment(scene, pngs.cards[scene.id], manifest.fps, segment);
    } else {
      await buildScreenSegment(scene, pngs.captions[scene.id], manifest.fps, takeDir, segment);
    }
    segments.push(segment);
    console.log(`segment ${scene.id}`);
  }

  const listFile = join(workDir, 'concat.txt');
  await writeFile(listFile, `${segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n')}\n`);

  // A video-only mp4 makes some presentation software refuse the file outright, so mux a
  // silent stereo track; live narration is layered over this in the pitch itself.
  await ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart', out,
  ], { label: 'concat' });

  console.log(`\nmaster -> ${out}`);
}

await main();
