/**
 * Shared broadcast engine — used by both the Telegram bot handlers and the
 * web admin panel. Sends the message verbatim (plain text, no HTML parsing)
 * in chunks of LIMITS.broadcastChunk recipients so every invocation stays
 * well inside Workers' subrequest limits and Telegram's rate limits.
 *
 * Chunk claiming is a compare-and-set on next_offset, so double-taps /
 * double-clicks can never send the same chunk twice. Progress is persisted
 * in D1 and the broadcast continues chunk-by-chunk until done.
 */

import { LIMITS } from './validate.js';

/**
 * Send the next chunk of broadcast `b`. Returns:
 *   { done: false, broadcast }  — more chunks remain, show a continue action
 *   { done: true,  broadcast }  — finished (broadcast.sent / .failed are final)
 *   null                        — another caller already claimed this chunk
 */
export async function runBroadcastChunk(store, tg, b) {
  const start = b.nextOffset;
  const next = Math.min(start + LIMITS.broadcastChunk, b.total);
  const claimed = await store.claimBroadcastChunk(b.id, start, next);
  if (!claimed) return null; // another tap/click already claimed this chunk

  const ids = await store.usersPage(start, LIMITS.broadcastChunk);
  let okCount = 0;
  let failCount = 0;
  for (const id of ids) {
    try {
      await tg.sendPlainMessage(id, b.text);
      okCount++;
    } catch {
      // 403 = blocked bot, timeouts, transient Telegram errors — count and move on.
      failCount++;
    }
  }

  const done = next >= b.total;
  const broadcast = await store.updateBroadcast(b.id, {
    sentDelta: okCount,
    failedDelta: failCount,
    status: done ? 'done' : 'running',
  });

  return { done, broadcast };
}
