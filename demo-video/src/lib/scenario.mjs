import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateRedactRules } from './redact.mjs';

const STEP_KINDS = new Set([
  'goto', 'click', 'fill', 'press', 'hover', 'scroll', 'wait', 'highlight', 'caption', 'settle',
]);

/**
 * Scenarios are data, not code, so a demo can be re-cut for a different audience without
 * touching the recorder. Validate eagerly: a typo in a 6-scene scenario otherwise only
 * surfaces minutes into a take, after the app is already booted.
 */
function checkSelector(where, step, errors) {
  if (!Array.isArray(step.selector)) return;
  if (step.selector.length === 0) errors.push(`${where}.selector must not be an empty array`);
  if (step.selector.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    errors.push(`${where}.selector must be a list of non-empty selector strings`);
  }
}

function checkStep(where, step, errors) {
  if (!STEP_KINDS.has(step.do)) {
    errors.push(`${where}.do "${step.do}" is not one of: ${[...STEP_KINDS].join(', ')}`);
  }
  if (['click', 'fill', 'hover', 'highlight'].includes(step.do) && !step.selector) {
    errors.push(`${where}.selector is required for "${step.do}"`);
  }
  checkSelector(where, step, errors);
  if (step.optional && step.do === 'goto') {
    // A skipped `goto` leaves every later step filming the previous page.
    errors.push(`${where}.optional is not allowed on "goto" — a missing page is never garnish`);
  }
  if (step.do === 'fill' && step.value === undefined) errors.push(`${where}.value is required`);
  if (step.do === 'goto' && !step.url) errors.push(`${where}.url is required`);
  if (step.do === 'caption' && !step.text) errors.push(`${where}.text is required`);
  if (step.do === 'wait' && !step.selector && !step.ms) {
    errors.push(`${where} needs a \`selector\` or \`ms\``);
  }
}

export async function loadScenario(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const errors = [];

  if (!raw.name) errors.push('`name` is required');
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    errors.push('`scenes` must be a non-empty array');
  }

  validateRedactRules(raw.redact, (message) => errors.push(message));

  const accounts = raw.auth?.accounts ?? {};
  const accountNames = Object.keys(accounts);

  if (raw.auth) {
    if (!raw.auth.statePath) errors.push('`auth.statePath` is required when `auth` is set');
    if (!Array.isArray(raw.auth.steps) || raw.auth.steps.length === 0) {
      errors.push('`auth.steps` must be a non-empty array');
    }
    if (raw.auth.steps?.some((step) => step.do === 'caption')) {
      errors.push('`auth.steps` must not contain captions — sign-in is never filmed');
    }
    for (const [j, step] of (raw.auth.steps ?? []).entries()) {
      checkStep(`auth.steps[${j}]`, step, errors);
    }
    // One sign-in template, one saved session per account. The state paths have to differ
    // or the second account overwrites the first and every scene films as whoever signed
    // in last — which in a role-by-role tour is the one failure that still looks plausible.
    if (accountNames.length > 1 && !String(raw.auth.statePath).includes('{account}')) {
      errors.push('`auth.statePath` must contain `{account}` when `auth.accounts` has more than one entry');
    }
    for (const name of accountNames) {
      if (typeof accounts[name] !== 'object' || accounts[name] === null) {
        errors.push(`auth.accounts.${name} must be an object of template values`);
        continue;
      }
      for (const [key, value] of Object.entries(accounts[name])) {
        const isEnvRef = value && typeof value === 'object' && typeof value.env === 'string';
        if (/pass|secret|token/i.test(key) && !isEnvRef) {
          // Caught here rather than at record time: a committed password is already
          // leaked by the time a take would have failed.
          errors.push(
            `auth.accounts.${name}.${key} must be \`{ "env": "VAR_NAME" }\` — secrets are not stored in scenarios`,
          );
        }
        if (value !== null && typeof value === 'object' && !isEnvRef) {
          errors.push(`auth.accounts.${name}.${key} must be a string or \`{ "env": "VAR_NAME" }\``);
        }
      }
    }
    if (raw.auth.defaultAccount && !accountNames.includes(raw.auth.defaultAccount)) {
      errors.push(`\`auth.defaultAccount\` "${raw.auth.defaultAccount}" is not in \`auth.accounts\``);
    }
  }

  const seen = new Set();
  for (const [i, scene] of (raw.scenes ?? []).entries()) {
    const where = `scenes[${i}]`;
    if (!scene.id) errors.push(`${where}.id is required`);
    else if (seen.has(scene.id)) errors.push(`${where}.id "${scene.id}" is duplicated`);
    else seen.add(scene.id);

    if (scene.card) {
      if (!scene.card.headline) errors.push(`${where}.card.headline is required`);
      if (scene.as) errors.push(`${where}.as is meaningless on a card — cards film no app`);
    } else if (!Array.isArray(scene.steps) || scene.steps.length === 0) {
      errors.push(`${where} needs either a \`card\` or a non-empty \`steps\` array`);
    }

    if (scene.as && !accountNames.includes(scene.as)) {
      errors.push(
        `${where}.as "${scene.as}" is not in \`auth.accounts\``
          + (accountNames.length ? ` (have: ${accountNames.join(', ')})` : ' (none declared)'),
      );
    }

    const allSteps = [
      ...(scene.setup ?? []).map((step, j) => [`${where}.setup[${j}]`, step]),
      ...(scene.steps ?? []).map((step, j) => [`${where}.steps[${j}]`, step]),
    ];
    for (const [stepWhere, step] of allSteps) checkStep(stepWhere, step, errors);
    if (scene.setup?.some((step) => step.do === 'caption')) {
      errors.push(`${where}.setup must not contain captions — setup footage is trimmed off`);
    }
  }

  if (errors.length) {
    throw new Error(`Invalid scenario ${path}:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    ...raw,
    baseUrl: raw.baseUrl ?? 'http://localhost:3000',
    viewport: { width: 1920, height: 1080, ...(raw.viewport ?? {}) },
    fps: raw.fps ?? 30,
    theme: raw.theme ?? {},
    redact: raw.redact ?? [],
    dir: dirname(resolve(path)),
  };
}
