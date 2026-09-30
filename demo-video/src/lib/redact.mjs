/**
 * An IR video of a trade-compliance product films real screens, which means real partner
 * names, business registration numbers and amounts end up in a file that gets emailed to
 * investors. Redaction has to survive navigation and re-renders, so it runs as an init
 * script with a MutationObserver rather than a one-shot pass before each screenshot.
 *
 * Layout is preserved in every mode: a redacted screen that reflows no longer shows what
 * the product actually looks like.
 */
const MODES = new Set(['blur', 'block', 'replace']);

export function validateRedactRules(rules, push) {
  for (const [i, rule] of (rules ?? []).entries()) {
    if (!rule.selector) push(`redact[${i}].selector is required`);
    if (!MODES.has(rule.mode)) {
      push(`redact[${i}].mode "${rule.mode}" is not one of: ${[...MODES].join(', ')}`);
    }
    if (rule.mode === 'replace' && rule.value === undefined) {
      push(`redact[${i}].value is required when mode is "replace"`);
    }
  }
}

export function redactInitScript(rules) {
  return `
(() => {
  const RULES = ${JSON.stringify(rules)};
  const MARK = '__lmRedacted';

  function apply(el, rule) {
    if (el.dataset[MARK] === rule.mode) return;
    el.dataset[MARK] = rule.mode;
    if (rule.mode === 'blur') {
      el.style.filter = 'blur(7px)';
      el.style.userSelect = 'none';
    } else if (rule.mode === 'block') {
      // Read the colour before clearing it. Deriving the bar from currentColor paints it
      // in the transparent colour we just set, so the text vanishes with no bar at all —
      // which reads as missing data rather than withheld data.
      const ink = getComputedStyle(el).color;
      el.style.background = ink;
      el.style.color = 'transparent';
      el.style.borderRadius = '3px';
      el.style.boxShadow = '0 0 0 2px ' + ink;
    } else if (rule.mode === 'replace') {
      if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.value = rule.value;
      } else {
        el.textContent = rule.value;
      }
    }
  }

  function sweep() {
    for (const rule of RULES) {
      for (const el of document.querySelectorAll(rule.selector)) apply(el, rule);
    }
  }

  function start() {
    sweep();
    new MutationObserver(sweep).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;
}
