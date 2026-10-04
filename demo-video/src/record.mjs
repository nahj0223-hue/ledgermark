/**
 * Scenario -> one webm per scene + a manifest describing caption windows.
 *
 * One video file per scene (rather than a single long take) so a scene that goes wrong
 * can be re-shot on its own — during IR prep the demo script changes far more often than
 * the app does.
 */
import { mkdir, rm, rename, writeFile, readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
      'Usage: node src/record.mjs <scenario.json> [--out <dir>] [--only <sceneId>] [--base-url <url>] [--check] [--refresh-auth]',
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
    baseUrl: flags['base-url'],
  };
}

const exists = (path) => access(path).then(() => true, () => false);

/**
 * `{email}` / `{password}` / `{account}` in a sign-in step are filled from the account's
 * own values, so one sign-in template serves every role. Deep links like
 * `/login?next=/console&switch=1&email={email}` are the whole reason this exists: the demo
 * build switches account from the URL, so a role tour needs no second login form.
 */
function withVars(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
  }
  if (Array.isArray(value)) return value.map((item) => withVars(item, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withVars(v, vars)]));
  }
  return value;
}

const SELECTOR_STEPS = new Set(['click', 'fill', 'hover', 'highlight', 'wait']);

/**
 * A step may list several selectors; the first one actually on the page wins.
 *
 * This exists because the tour films a deployed build we cannot inspect between takes.
 * One renamed id otherwise ends a sixteen-scene take at scene three, and the cost of
 * re-shooting is the whole run, not the one step.
 */
async function resolveSelector(page, step, check) {
  const candidates = Array.isArray(step.selector) ? step.selector : [step.selector];
  if (candidates.length === 1) return candidates[0];
  const budget = step.probeMs ?? (check ? 700 : 2_500);
  for (const candidate of candidates) {
    try {
      await page.locator(candidate).first().waitFor({ state: 'attached', timeout: budget });
      return candidate;
    } catch {
      // try the next spelling
    }
  }
  throw new Error(`none of ${candidates.length} selectors matched: ${candidates.join(' | ')}`);
}

async function runStep(page, step, scene, sceneStartedAt, options = {}) {
  const { check = false, onSkip } = options;
  let resolved = step;
  try {
    if (SELECTOR_STEPS.has(step.do) && step.selector) {
      resolved = { ...step, selector: await resolveSelector(page, step, check) };
    }
    return await dispatchStep(page, resolved, scene, sceneStartedAt);
  } catch (error) {
    const target = resolved.selector ?? resolved.url ?? '';
    const reason = `${step.do}${target ? ` "${Array.isArray(target) ? target[0] : target}"` : ''} — ${error.message.split('\n')[0]}`;
    // `optional` steps are garnish — a KPI to point at, a panel to expand. Losing one
    // costs a beat of footage; losing the take costs the run. Required steps still fail
    // hard, so a missing sign-in or a missing page is never papered over.
    if (step.optional) {
      onSkip?.(reason);
      return null;
    }
    throw new Error(reason);
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
      const box = await page.locator(step.selector).first().boundingBox();
      if (!box) throw new Error('element has no layout box to highlight');
      // `:has-text()` matches ancestors too and returns the outermost one, so a fallback
      // selector can quietly resolve to a page-sized container. The ring then frames the
      // whole screen, which points at nothing — a highlight that highlights everything is
      // the same as no highlight, except it looks deliberate.
      const view = page.viewportSize();
      if (view && box.width * box.height > view.width * view.height * 0.8) {
        throw new Error('matched a page-sized container, not a thing to point at');
      }
      await page.evaluate(([b, d]) => window.__lmHighlight?.(b, d), [box, ms]);
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
 * Sign in once per account and reuse the cookies. Repeating a login inside each scene's
 * `setup` works, but it re-types credentials on every take and puts the password on screen
 * in footage that is only trimmed afterwards.
 *
 * Returns a lookup of account name -> saved session, with `null` holding the session used
 * by scenes that name no account.
 */
async function ensureAuthState(browser, scenario, { refreshAuth, check, accountsInUse }) {
  if (!scenario.auth) return new Map();

  const declared = scenario.auth.accounts ?? {};
  const names = Object.keys(declared);
  const resolveAccount = (name) =>
    Object.fromEntries(
      Object.entries(declared[name]).map(([key, value]) => {
        // Credentials come from the environment, never from the scenario file. The demo
        // build is publicly reachable and this repository is public, so a password
        // committed here is a password handed to anyone who clones it.
        if (value && typeof value === 'object' && typeof value.env === 'string') {
          const fromEnv = process.env[value.env];
          if (!fromEnv) {
            throw new Error(
              `auth.accounts.${name}.${key} needs the ${value.env} environment variable, which is not set`,
            );
          }
          return [key, fromEnv];
        }
        return [key, value];
      }),
    );
  // No `accounts` block: one session, shared by every scene — the original behaviour.
  const jobs = names.length
    ? names
        .filter((name) => accountsInUse.has(name))
        .map((name) => ({ key: name, vars: { account: name, ...resolveAccount(name) } }))
    : [{ key: null, vars: {} }];

  const states = new Map();
  for (const { key, vars } of jobs) {
    const relative = withVars(scenario.auth.statePath, vars);
    const statePath = resolve(scenario.dir, relative);
    const label = key ?? 'default';
    // Fingerprint what produced this session — the account's values and the sign-in steps.
    // Change an account's email and the old cookies still work; every scene then films as
    // whoever signed in last time, and nothing in the footage says so. Hash, never values:
    // the sidecar must not become somewhere a password ends up at rest.
    const fingerprintPath = `${statePath}.fingerprint`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ vars, steps: scenario.auth.steps }))
      .digest('hex');

    const reusable =
      !refreshAuth &&
      (await exists(statePath)) &&
      (await readFile(fingerprintPath, 'utf8').catch(() => null))?.trim() === fingerprint;

    if (reusable) {
      console.log(`auth   ${label} — reusing ${relative}`);
      states.set(key, statePath);
      continue;
    }
    if (!refreshAuth && (await exists(statePath))) {
      console.log(`auth   ${label} — account changed since ${relative} was saved, signing in again`);
    }

    const context = await browser.newContext({ viewport: scenario.viewport });
    context.setDefaultTimeout(check ? 5_000 : 30_000);
    const page = await context.newPage();
    try {
      for (const step of scenario.auth.steps) {
        await runStep(page, hurry(withVars(step, vars), check), { baseUrl: scenario.baseUrl }, Date.now(), { check });
      }
    } catch (error) {
      await context.close();
      throw new Error(`Sign-in failed for ${label}: ${error.message}`);
    }
    await mkdir(dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
    await writeFile(fingerprintPath, `${fingerprint}\n`);
    await context.close();
    console.log(`auth   ${label} — signed in -> ${relative}`);
    states.set(key, statePath);
  }

  return states;
}

/** The session a scene films under, or undefined when the scenario has no `auth`. */
function sessionFor(scene, scenario, states) {
  // Some screens are reachable without signing in, and that is the thing being shown.
  // Filming them under a session would quietly prove the opposite of the claim.
  if (scene.signedOut) return undefined;
  if (!states.size) return undefined;
  const key = scene.as ?? scenario.auth?.defaultAccount ?? null;
  if (states.has(key)) return states.get(key);
  // Falling back silently would film the scene as the wrong role, which is exactly the
  // mistake a multi-role tour must never ship.
  throw new Error(
    `Scene "${scene.id}" needs account "${key ?? 'default'}" but no session was prepared for it`,
  );
}

async function main() {
  const { scenarioPath, out, only, check, refreshAuth, baseUrl } = parseArgs(process.argv.slice(2));
  const scenario = await loadScenario(scenarioPath);
  // The same scenario is rehearsed against the stand-in stage and shot against the
  // deployed build, so the target is a flag rather than an edit to the scenario.
  if (baseUrl) {
    scenario.baseUrl = baseUrl;
    console.log(`base   ${baseUrl}`);
  }

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

  // Sign in only for the accounts the selected scenes actually film under, so `--only`
  // on one scene does not walk a login for all six roles.
  const accountsInUse = new Set(
    scenes
      .filter((scene) => !scene.card && !scene.signedOut)
      .map((scene) => scene.as ?? scenario.auth?.defaultAccount)
      .filter(Boolean),
  );
  const authStates = await ensureAuthState(browser, scenario, { refreshAuth, check, accountsInUse });
  const manifest = { name: scenario.name, fps: scenario.fps, viewport: scenario.viewport, theme: scenario.theme, scenes: [] };
  const failures = [];
  const optionalSkips = [];

  for (const scene of scenes) {
    if (scene.card) {
      manifest.scenes.push({ id: scene.id, kind: 'card', card: scene.card, seconds: scene.seconds ?? 3.4 });
      if (!check) console.log(`card   ${scene.id}`);
      continue;
    }

    const storageState = sessionFor(scene, scenario, authStates);
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
    const skipped = [];
    const noteSkip = (reason) => {
      skipped.push(reason);
      console.log(`  skip ${scene.id}  ${reason}`);
    };
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
        await runStep(page, hurry({ ...step, ms: step.ms ?? 0 }, check), { ...scene, baseUrl: scenario.baseUrl }, openedAt, { check, onSkip: noteSkip });
      }
      startedAt = Date.now();

      for (const step of scene.steps) {
        const caption = await runStep(page, hurry({ ...step }, check), { ...scene, baseUrl: scenario.baseUrl }, startedAt, { check, onSkip: noteSkip });
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
      if (skipped.length) optionalSkips.push({ scene: scene.id, skipped });
      console.log(
        failed
          ? `FAIL   ${scene.id}  ${failed}`
          : `ok     ${scene.id}${skipped.length ? `  (${skipped.length} optional step(s) skipped)` : ''}`,
      );
      continue;
    }

    const target = join(videoDir, `${scene.id}.webm`);
    await rename(rawPath, target);
    manifest.scenes.push({ id: scene.id, kind: 'screen', as: scene.signedOut ? 'signed-out' : scene.as ?? null, file: `scenes/${scene.id}.webm`, seconds, trimStart, captions, skipped });
    console.log(
      `scene  ${scene.id}  ${seconds.toFixed(1)}s  ${captions.length} caption(s)` +
        (scene.signedOut ? '  signed out' : scene.as ? `  as ${scene.as}` : '') +
        (trimStart > 0.05 ? `  (+${trimStart.toFixed(1)}s setup trimmed)` : ''),
    );
  }

  await browser.close();

  if (check) {
    const skippedCount = optionalSkips.reduce((n, entry) => n + entry.skipped.length, 0);
    if (skippedCount) {
      console.log(
        `\n${skippedCount} optional step(s) would be skipped — the take survives, but that `
          + 'footage is missing. Fix the selectors to get it back.',
      );
    }
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
