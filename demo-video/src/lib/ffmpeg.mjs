import { execFile } from 'node:child_process';
import { ffmpegPath } from './env.mjs';

/**
 * ffmpeg writes progress to stderr and is extremely verbose, so surface stderr only when
 * the command actually fails — otherwise a successful render buries the log.
 */
export function ffmpeg(args, { label } = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 26 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg failed${label ? ` (${label})` : ''}: ${stderr.trim() || error.message}`));
        return;
      }
      resolvePromise();
    });
  });
}

/** Shared encode settings: yuv420p and the High profile are what decks and players expect. */
export const VIDEO_ARGS = [
  '-c:v', 'libx264',
  '-profile:v', 'high',
  '-preset', 'medium',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
];
