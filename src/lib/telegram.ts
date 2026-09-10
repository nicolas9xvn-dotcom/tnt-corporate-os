// Free push notification to the founder's phone when a task finishes or
// needs approval — Telegram's Bot API has no cost and no rate limit that
// matters at this scale. Silently no-ops if the 2 env vars aren't set, so
// this never blocks a task from completing just because notifications
// aren't configured yet (see README for the BotFather setup steps).
export async function notifyTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    // No parse_mode: the text often embeds an agent's raw output, which can
    // contain "_"/"*"/"[" — Telegram's Markdown parser rejects the whole
    // message (400) on any unescaped/unbalanced special character, and a
    // silently-dropped notification is worse than a plain-text one.
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // A failed notification must never fail the task it's reporting on.
  }
}
