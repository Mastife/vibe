import type { AppEnv } from '../env'
import type { FetchLike } from '../lib/fetch'

export type Notifier = {
  send(text: string): Promise<boolean>
}

/** Sends plain HTML messages to one chat; failures are logged, never thrown, so monitoring keeps running. */
export class TelegramNotifier implements Notifier {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(text: string): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        console.error(`Telegram sendMessage failed with HTTP ${response.status}`)
        return false
      }

      return true
    } catch (error) {
      console.error('Telegram sendMessage failed', error)
      return false
    }
  }
}

export function createNotifierFromEnv(env: AppEnv, fetchImpl: FetchLike = fetch): Notifier | null {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null
  return new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetchImpl)
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
