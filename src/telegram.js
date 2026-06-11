/**
 * Lightweight wrapper around the Telegram Bot API.
 * Docs: https://core.telegram.org/bots/api
 */

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
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Telegram ${method} returned non-JSON (status ${res.status})`);
    }

    if (!data.ok) {
      const desc = data.description || 'unknown error';
      // 403 = user blocked the bot; surface a typed error so broadcast can skip them.
      const err = new Error(`Telegram ${method} failed: ${desc}`);
      err.code = data.error_code;
      err.description = desc;
      throw err;
    }
    return data.result;
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
