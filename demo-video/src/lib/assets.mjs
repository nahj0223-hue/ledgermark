import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const MEDIA = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Brand and product imagery is inlined as a data URI rather than referenced by path.
 *
 * Cards are rendered in an about:blank document, where Chromium refuses to load local
 * files — a logo linked by file:// silently renders as nothing, and the first anyone
 * notices is a finished mp4 with a hole where the brand mark should be. Inlining fails
 * loudly instead, at load time, naming the file.
 */
export async function dataUri(path) {
  const type = MEDIA[extname(path).toLowerCase()];
  if (!type) {
    throw new Error(
      `Unsupported image type "${extname(path)}" for ${path} — use ${Object.keys(MEDIA).join(', ')}`,
    );
  }
  const bytes = await readFile(path).catch(() => {
    throw new Error(`Image not found: ${path}`);
  });
  return `data:${type};base64,${bytes.toString('base64')}`;
}
