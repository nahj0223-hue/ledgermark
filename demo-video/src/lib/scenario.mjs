import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const STEP_KINDS = new Set([
  'goto', 'click', 'fill', 'press', 'hover', 'scroll', 'wait', 'highlight', 'caption', 'settle',
]);

/**
 * Scenarios are data, not code, so a demo can be re-cut for a different audience without
 * touching the recorder. Validate eagerly: a typo in a 6-scene scenario otherwise only
 * surfaces minutes into a take, after the app is already booted.
 */
export async function loadScenario(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const errors = [];

  if (!raw.name) errors.push('`name` is required');
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    errors.push('`scenes` must be a non-empty array');
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

    for (const [j, step] of (scene.steps ?? []).entries()) {
      const stepWhere = `${where}.steps[${j}]`;
      if (!STEP_KINDS.has(step.do)) {
        errors.push(`${stepWhere}.do "${step.do}" is not one of: ${[...STEP_KINDS].join(', ')}`);
      }
      const needsSelector = ['click', 'fill', 'hover', 'highlight'].includes(step.do);
      if (needsSelector && !step.selector) errors.push(`${stepWhere}.selector is required for "${step.do}"`);
      if (step.do === 'fill' && step.value === undefined) errors.push(`${stepWhere}.value is required`);
      if (step.do === 'goto' && !step.url) errors.push(`${stepWhere}.url is required`);
      if (step.do === 'caption' && !step.text) errors.push(`${stepWhere}.text is required`);
      if (step.do === 'wait' && !step.selector && !step.ms) {
        errors.push(`${stepWhere} needs a \`selector\` or \`ms\``);
      }
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
    dir: dirname(resolve(path)),
  };
}
