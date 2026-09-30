/**
 * Scenario -> one webm per scene + a manifest describing caption windows.
 *
 * One video file per scene (rather than a single long take) so a scene that goes wrong
 * can be re-shot on its own — during IR prep the demo script changes far more often than
 * the app does.
 */
import { mkdir, rm, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumPath } from './lib/env.mjs';
import { loadScenario } from './lib/scenario.mjs';
import { CURSOR_INIT_SCRIPT, glideTo, glideToSelector, ripple } from './lib/pointer.mjs';

function parseArgs(argv) {
  const [scenarioPath, ...rest] = argv;
  if (!scenarioPath) {
    throw new Error('Usage: node src/record.mjs <scenario.json> [--out <dir>] [--only <sceneId>]');
  }
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--')) throw new Error(`Unexpected argument "${rest[i]}"`);
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  return { scenarioPath: resolve(scenarioPath), out: resolve(flags.out ?? 'out'), only: flags.only };
}

async function runStep(page, step, scene, sceneStartedAt) {
  const at = () => (Date.now() - sceneStartedAt) / 1000;

  switch (step.do) {
    case 'goto': {
      const url = step.url.startsWith('http') ? step.url : new URL(step.url, scene.baseUrl).href;
      await page.goto(url, { waitUntil: step.waitUntil ?? 'networkidle' });
      break;
    }
    case 'wait':
      if (step.selector) await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 30_000 });
      if (step.ms) await page.waitForTimeout(step.ms);
      break;
    case 'settle':
      await page.waitForTimeout(step.ms ?? 900);
      break;
    case 'hover':
      await glideToSelector(page, step.selector);
      await page.waitForTimeout(step.ms ?? 500);
      break;
    case 'click': {
      const { x, y } = await glideToSelector(page, step.selector);
      await ripple(page, x, y);
      await page.waitForTimeout(160);
      await page.locator(step.selector).first().click();
      await page.waitForTimeout(step.ms ?? 700);
      break;
    }
    case 'fill': {
      await glideToSelector(page, step.selector);
      const field = page.locator(step.selector).first();
      await field.click();
      // Type rather than set the value outright: a field that fills instantly reads as a
      // scripted stub, and reviewers watch for exactly that.
      await field.pressSequentially(String(step.value), { delay: step.typeDelayMs ?? 55 });
      await page.waitForTimeout(step.ms ?? 400);
      break;
    }
    case 'press':
      await page.keyboard.press(step.key);
      await page.waitForTimeout(step.ms ?? 600);
      break;
    case 'scroll': {
      const distance = step.to ?? 600;
      const duration = step.ms ?? 1400;
      await page.evaluate(
        ([to, ms]) =>
          new Promise((done) => {
            const from = window.scrollY;
            const start = performance.now();
            const tick = (now) => {
              const t = Math.min(1, (now - start) / ms);
              const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
              window.scrollTo(0, from + (to - from) * eased);
              if (t < 1) requestAnimationFrame(tick);
              else done();
            };
            requestAnimationFrame(tick);
          }),
        [distance, duration],
      );
      await page.waitForTimeout(250);
      break;
    }
    case 'highlight': {
      const ms = step.ms ?? 2000;
      await glideToSelector(page, step.selector);
      await page.evaluate(([sel, d]) => window.__lmHighlight?.(sel, d), [step.selector, ms]);
      await page.waitForTimeout(ms);
      break;
    }
    case 'caption':
      // Captions are not drawn in the browser — they are overlaid at produce time so the
      // wording can be rewritten without re-recording the app.
      return { text: step.text, sub: step.sub, start: at(), duration: (step.ms ?? 3200) / 1000 };
    default:
      throw new Error(`Unhandled step "${step.do}"`);
  }
  return null;
}

async function main() {
  const { scenarioPath, out, only } = parseArgs(process.argv.slice(2));
  const scenario = await loadScenario(scenarioPath);

  const videoDir = join(out, 'scenes');
  await rm(out, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });

  const scenes = scenario.scenes.filter((s) => !only || s.id === only);
  if (!scenes.length) throw new Error(`No scene matched --only ${only}`);

  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text'],
  });

  const manifest = { name: scenario.name, fps: scenario.fps, viewport: scenario.viewport, theme: scenario.theme, scenes: [] };

  for (const scene of scenes) {
    if (scene.card) {
      manifest.scenes.push({ id: scene.id, kind: 'card', card: scene.card, seconds: scene.seconds ?? 3.4 });
      console.log(`card   ${scene.id}`);
      continue;
    }

    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: videoDir, size: scenario.viewport },
      ...(scenario.contextOptions ?? {}),
    });
    await context.addInitScript(CURSOR_INIT_SCRIPT);

    const page = await context.newPage();
    const captions = [];
    const startedAt = Date.now();
    // Park the cursor off to the side so the first glide reads as a deliberate move.
    await glideTo(page, scenario.viewport.width * 0.5, scenario.viewport.height * 0.92, { steps: 1, stepDelayMs: 0 });

    try {
      for (const step of scene.steps) {
        const caption = await runStep(page, { ...step }, { ...scene, baseUrl: scenario.baseUrl }, startedAt);
        if (caption) captions.push(caption);
      }
    } catch (error) {
      await context.close();
      await browser.close();
      throw new Error(`Scene "${scene.id}" failed: ${error.message}`);
    }

    const seconds = (Date.now() - startedAt) / 1000;
    const rawPath = await page.video().path();
    await context.close();

    const target = join(videoDir, `${scene.id}.webm`);
    await rename(rawPath, target);
    manifest.scenes.push({ id: scene.id, kind: 'screen', file: `scenes/${scene.id}.webm`, seconds, captions });
    console.log(`scene  ${scene.id}  ${seconds.toFixed(1)}s  ${captions.length} caption(s)`);
  }

  await browser.close();
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nmanifest -> ${join(out, 'manifest.json')}`);
}

await main();
