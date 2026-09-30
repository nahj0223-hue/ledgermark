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
function checkStep(where, step, errors) {
  if (!STEP_KINDS.has(step.do)) {
    errors.push(`${where}.do "${step.do}" is not one of: ${[...STEP_KINDS].join(', ')}`);
  }
  if (['click', 'fill', 'hover', 'highlight'].includes(step.do) && !step.selector) {
    errors.push(`${where}.selector is required for "${step.do}"`);
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
  }

  const seen = new Set();
  for (const [i, scene] of (raw.scenes ?? []).entries()) {
    const where = `scenes[${i}]`;
    if (!scene.id) errors.push(`${where}.id is required`);
    else if (seen.has(scene.id)) errors.push(`${where}.id "${scene.id}" is duplicated`);
    else seen.add(scene.id);

    if (scene.card) {
      if (!scene.card.headline) errors.push(`${where}.card.headline is required`);
    } else if (!Array.isArray(scene.steps) || scene.steps.length === 0) {
      errors.push(`${where} needs either a \`card\` or a non-empty \`steps\` array`);
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
