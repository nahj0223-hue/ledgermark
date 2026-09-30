/**
 * Scenario -> one webm per scene + a manifest describing caption windows.
 *
 * One video file per scene (rather than a single long take) so a scene that goes wrong
 * can be re-shot on its own — during IR prep the demo script changes far more often than
 * the app does.
 */
import { mkdir, rm, rename, writeFile, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumPath } from './lib/env.mjs';
import { loadScenario } from './lib/scenario.mjs';
import { redactInitScript } from './lib/redact.mjs';
import { CURSOR_INIT_SCRIPT, glideTo, glideToSelector, ripple } from './lib/pointer.mjs';

const BOOLEAN_FLAGS = new Set(['check', 'refresh-auth']);

function parseArgs(argv) {
  const [scenarioPath, ...rest] = argv;
  if (!scenarioPath) {
    throw new Error(
      'Usage: node src/record.mjs <scenario.json> [--out <dir>] [--only <sceneId>] [--check] [--refresh-auth]',
    );
  }
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument "${token}"`);
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
    } else {
      flags[name] = rest[i + 1];
      i += 1;
    }
  }
  return {
    scenarioPath: resolve(scenarioPath),
    out: resolve(flags.out ?? 'out'),
    only: flags.only,
    check: Boolean(flags.check),
    refreshAuth: Boolean(flags['refresh-auth']),
  };
}

const exists = (path) => access(path).then(() => true, () => false);

async function runStep(page, step, scene, sceneStartedAt) {
  try {
    return await dispatchStep(page, step, scene, sceneStartedAt);
  } catch (error) {
    const target = step.selector ?? step.url ?? '';
    throw new Error(
      `${step.do}${target ? ` "${target}"` : ''} — ${error.message.split('\n')[0]}`,
    );
  }
}

async function dispatchStep(page, step, scene, sceneStartedAt) {
  const at = () => (Date.now() - sceneStartedAt) / 1000;

  switch (step.do) {
    case 'goto': {
      const url = step.url.startsWith('http') ? step.url : new URL(step.url, scene.baseUrl).href;
      await page.goto(url, { waitUntil: step.waitUntil ?? 'networkidle' });
      break;
    }
    case 'wait':
      if (step.selector) {
        await page.waitForSelector(step.selector, ...(step.timeoutMs ? [{ timeout: step.timeoutMs }] : []));
      }
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

/** In --check mode every wait is cut to the minimum: this is a dry run, not a take. */
const hurry = (step, check) => (check ? { ...step, ms: step.do === 'wait' ? step.ms : 0, typeDelayMs: 0 } : step);

/**
 * Sign in once and reuse the cookies for every scene. Repeating a login inside each
 * scene's `setup` works, but it re-types credentials on every take and puts the
 * password on screen in footage that is only trimmed afterwards.
 */
async function ensureAuthState(browser, scenario, { refreshAuth, check }) {
  if (!scenario.auth) return undefined;
  const statePath = resolve(scenario.dir, scenario.auth.statePath);

  if (!refreshAuth && (await exists(statePath))) {
    console.log(`auth   reusing ${scenario.auth.statePath}`);
    return statePath;
  }

  const context = await browser.newContext({ viewport: scenario.viewport });
  context.setDefaultTimeout(check ? 5_000 : 30_000);
  const page = await context.newPage();
  try {
    for (const step of scenario.auth.steps) {
      await runStep(page, hurry(step, check), { baseUrl: scenario.baseUrl }, Date.now());
    }
  } catch (error) {
    await context.close();
    throw new Error(`Sign-in failed: ${error.message}`);
  }
  await mkdir(dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  await context.close();
  console.log(`auth   signed in -> ${scenario.auth.statePath}`);
  return statePath;
}

async function main() {
  const { scenarioPath, out, only, check, refreshAuth } = parseArgs(process.argv.slice(2));
  const scenario = await loadScenario(scenarioPath);

  const videoDir = join(out, 'scenes');
  if (!check) {
    await rm(out, { recursive: true, force: true });
    await mkdir(videoDir, { recursive: true });
  }

  const scenes = scenario.scenes.filter((s) => !only || s.id === only);
  if (!scenes.length) throw new Error(`No scene matched --only ${only}`);

  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text'],
  });

  const storageState = await ensureAuthState(browser, scenario, { refreshAuth, check });
  const manifest = { name: scenario.name, fps: scenario.fps, viewport: scenario.viewport, theme: scenario.theme, scenes: [] };
  const failures = [];

  for (const scene of scenes) {
    if (scene.card) {
      manifest.scenes.push({ id: scene.id, kind: 'card', card: scene.card, seconds: scene.seconds ?? 3.4 });
      if (!check) console.log(`card   ${scene.id}`);
      continue;
    }

    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: 1,
      ...(storageState ? { storageState } : {}),
      ...(check ? {} : { recordVideo: { dir: videoDir, size: scenario.viewport } }),
      ...(scenario.contextOptions ?? {}),
    });
    await context.addInitScript(CURSOR_INIT_SCRIPT);
    if (scenario.redact.length) await context.addInitScript(redactInitScript(scenario.redact));

    context.setDefaultTimeout(check ? 5_000 : 30_000);

    const page = await context.newPage();
    const captions = [];
    const openedAt = Date.now();
    // Park the cursor off to the side so the first glide reads as a deliberate move.
    await glideTo(page, scenario.viewport.width * 0.5, scenario.viewport.height * 0.92, { steps: 1, stepDelayMs: 0 });

    let startedAt = openedAt;
    let failed = null;
    try {
      // `setup` drives the app into the state this scene starts from — signing in, or
      // replaying an earlier scene's flow. Each scene records into its own context, so
      // state never carries over on its own. The footage is still captured (Playwright
      // cannot pause a recording), so measure it and let produce trim it off.
      for (const step of scene.setup ?? []) {
        await runStep(page, hurry({ ...step, ms: step.ms ?? 0 }, check), { ...scene, baseUrl: scenario.baseUrl }, openedAt);
      }
      startedAt = Date.now();

      for (const step of scene.steps) {
        const caption = await runStep(page, hurry({ ...step }, check), { ...scene, baseUrl: scenario.baseUrl }, startedAt);
        if (caption) captions.push(caption);
      }
    } catch (error) {
      failed = error.message.split('\n')[0];
      // A dry run reports every broken scene at once; a real take stops at the first,
      // because everything after it would be filmed against the wrong state anyway.
      if (!check) {
        await context.close();
        await browser.close();
        throw new Error(`Scene "${scene.id}" failed: ${failed}`);
      }
      failures.push({ scene: scene.id, reason: failed });
    }

    const seconds = (Date.now() - startedAt) / 1000;
    const trimStart = (startedAt - openedAt) / 1000;
    const rawPath = check ? null : await page.video().path();
    await context.close();

    if (check) {
      console.log(failed ? `FAIL   ${scene.id}  ${failed}` : `ok     ${scene.id}`);
      continue;
    }

    const target = join(videoDir, `${scene.id}.webm`);
    await rename(rawPath, target);
    manifest.scenes.push({ id: scene.id, kind: 'screen', file: `scenes/${scene.id}.webm`, seconds, trimStart, captions });
    console.log(
      `scene  ${scene.id}  ${seconds.toFixed(1)}s  ${captions.length} caption(s)` +
        (trimStart > 0.05 ? `  (+${trimStart.toFixed(1)}s setup trimmed)` : ''),
    );
  }

  await browser.close();

  if (check) {
    console.log(
      failures.length
        ? `\n${failures.length} scene(s) failed — fix the selectors above, then re-run --check.`
        : '\nAll scenes pass. Re-run without --check to record.',
    );
    process.exit(failures.length ? 1 : 0);
  }

  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nmanifest -> ${join(out, 'manifest.json')}`);
}

await main();
