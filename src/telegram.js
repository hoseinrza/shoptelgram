/**
 * Lightweight wrapper around the Telegram Bot API.
 * Docs: https://core.telegram.org/bots/api
 *
 * Built for webhook-driven Workers:
 *  - every call is time-boxed so a hung request can't eat the 30s budget;
 *  - 429 responses honor Telegram's retry_after with a bounded backoff
 *    (broadcast relies on this instead of hammering the API);
 *  - error messages never contain the bot token.
 */

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 10_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Telegram {
  constructor(token) {
    if (!token) throw new Error('BOT_TOKEN is missing');
    this.token = token;
    this.base = `https://api.telegram.org/bot${token}`;
  }

  /**
   * Call any Bot API method. Returns the `result` field on success.
   * Throws on Telegram-level errors so callers can decide how to react.
   */
  async call(method, params = {}) {
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${this.base}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        throw new Error(`Telegram ${method} request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Telegram ${method} returned non-JSON (status ${res.status})`);
      }

      if (data.ok) return data.result;

      // Rate limited: back off by retry_after (bounded) and retry.
      if (data.error_code === 429 && attempt < MAX_RETRIES) {
        const retryAfterMs = Number(data.parameters?.retry_after ?? 1) * 1000;
        // A retry_after beyond our cap means Telegram wants us quiet for long —
        // fail fast instead of blocking the invocation.
        if (retryAfterMs <= 0 || retryAfterMs > MAX_RETRY_AFTER_MS) {
          const err = new Error(`Telegram ${method} rate limited (429, retry_after too long)`);
          err.code = 429;
          err.description = data.description || 'Too Many Requests';
          throw err;
        }
        await sleep(retryAfterMs);
        continue;
      }

      const desc = data.description || 'unknown error';
      const err = new Error(`Telegram ${method} failed (${data.error_code}): ${desc}`);
      err.code = data.error_code;
      err.description = desc;
      throw err;
    }
  }

  sendMessage(chatId, text, extra = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    });
  }

  /** Plain text (no HTML parsing) — used for admin broadcast content. */
  sendPlainMessage(chatId, text, extra = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...extra,
    });
  }

  sendPhoto(chatId, photo, caption, extra = {}) {
    return this.call('sendPhoto', {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: 'HTML',
      ...extra,
    });
  }

  editMessageText(chatId, messageId, text, extra = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    });
  }

  editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    return this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    });
  }

  deleteMessage(chatId, messageId) {
    return this.call('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  answerCallbackQuery(id, extra = {}) {
    return this.call('answerCallbackQuery', { callback_query_id: id, ...extra });
  }

  setMyCommands(commands, scope) {
    return this.call('setMyCommands', scope ? { commands, scope } : { commands });
  }

  setWebhook(url, secretToken) {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
  }

  deleteWebhook() {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  getWebhookInfo() {
    return this.call('getWebhookInfo');
  }

  getMe() {
    return this.call('getMe');
  }
}
