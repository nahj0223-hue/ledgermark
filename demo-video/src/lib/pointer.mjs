/**
 * Headless Chromium records no mouse cursor, which makes a demo look like the UI is
 * operating itself — the single biggest tell of a cheap screen recording. Inject a
 * synthetic cursor and drive it along an eased path before every interaction, so a
 * viewer can follow intent rather than guess at it.
 */
export const CURSOR_INIT_SCRIPT = `
(() => {
  const ID = '__lm_cursor__';
  function mount() {
    if (document.getElementById(ID)) return;
    if (!document.body) return;
    const el = document.createElement('div');
    el.id = ID;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 28 28" fill="none">' +
      '<path d="M5 3 L5 21 L10 16.5 L13.2 23.5 L16.6 22 L13.4 15.2 L20 15 Z" ' +
      'fill="#fff" stroke="#0B0D10" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(el.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(-9999px,-9999px)',
      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.45))', willChange: 'transform',
    });
    document.documentElement.appendChild(el);
  }
  mount();
  document.addEventListener('DOMContentLoaded', mount);

  window.__lmCursor = (x, y) => {
    mount();
    const el = document.getElementById(ID);
    if (el) el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  };

  window.__lmRipple = (x, y) => {
    const r = document.createElement('div');
    Object.assign(r.style, {
      position: 'fixed', left: (x - 22) + 'px', top: (y - 22) + 'px',
      width: '44px', height: '44px', borderRadius: '50%',
      border: '2px solid rgba(74,222,128,.95)', zIndex: '2147483646',
      pointerEvents: 'none', transform: 'scale(.35)', opacity: '1',
      transition: 'transform .42s cubic-bezier(.22,1,.36,1), opacity .42s linear',
    });
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 480);
  };

  window.__lmHighlight = (selector, ms) => {
    const target = document.querySelector(selector);
    if (!target) return;
    const box = target.getBoundingClientRect();
    const pad = 8;
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'fixed', left: (box.left - pad) + 'px', top: (box.top - pad) + 'px',
      width: (box.width + pad * 2) + 'px', height: (box.height + pad * 2) + 'px',
      border: '3px solid rgba(74,222,128,.95)', borderRadius: '10px',
      boxShadow: '0 0 0 9999px rgba(11,13,16,.55)', zIndex: '2147483645',
      pointerEvents: 'none', opacity: '0', transition: 'opacity .3s ease',
    });
    document.documentElement.appendChild(ring);
    requestAnimationFrame(() => { ring.style.opacity = '1'; });
    setTimeout(() => {
      ring.style.opacity = '0';
      setTimeout(() => ring.remove(), 320);
    }, Math.max(0, ms - 320));
  };
})();
`;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Track the cursor ourselves: page.mouse has no readable position. */
const positions = new WeakMap();

export async function glideTo(page, x, y, { steps = 26, stepDelayMs = 12 } = {}) {
  const from = positions.get(page) ?? { x: page.viewportSize().width / 2, y: page.viewportSize().height * 0.85 };
  for (let i = 1; i <= steps; i += 1) {
    const t = easeInOutCubic(i / steps);
    const nx = from.x + (x - from.x) * t;
    const ny = from.y + (y - from.y) * t;
    await page.mouse.move(nx, ny);
    await page.evaluate(([px, py]) => window.__lmCursor?.(px, py), [nx, ny]);
    await page.waitForTimeout(stepDelayMs);
  }
  positions.set(page, { x, y });
}

export async function glideToSelector(page, selector, options) {
  const handle = page.locator(selector).first();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Selector "${selector}" has no bounding box (is it visible?)`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await glideTo(page, x, y, options);
  return { x, y };
}

export async function ripple(page, x, y) {
  await page.evaluate(([px, py]) => window.__lmRipple?.(px, py), [x, y]);
}
