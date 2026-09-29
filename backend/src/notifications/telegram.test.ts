import { describe, expect, test } from 'bun:test'

import { testEnv } from '../test-support/env'
import { createNotifierFromEnv, escapeHtml, TelegramNotifier } from './telegram'

describe('TelegramNotifier', () => {
  test('posts HTML messages to the configured chat', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return new Response('{"ok":true}')
    }

    const notifier = new TelegramNotifier('123:token', '-1001', fetchImpl)
    expect(await notifier.send('<b>hi</b>')).toBe(true)
    expect(calls[0]?.url).toBe('https://api.telegram.org/bot123:token/sendMessage')
    expect(calls[0]?.body).toMatchObject({ chat_id: '-1001', text: '<b>hi</b>', parse_mode: 'HTML' })
  })

  test('swallows transport failures and reports false', async () => {
    const failing = async () => {
      throw new Error('network down')
    }
    const notifier = new TelegramNotifier('t', 'c', failing)
    expect(await notifier.send('x')).toBe(false)

    const rejected = async () => new Response('bad', { status: 401 })
    expect(await new TelegramNotifier('t', 'c', rejected).send('x')).toBe(false)
  })

  test('is only created when both env values are present', () => {
    expect(createNotifierFromEnv(testEnv())).toBeNull()
    expect(createNotifierFromEnv(testEnv({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' }))).not.toBeNull()
  })

  test('escapes html special characters', () => {
    expect(escapeHtml('<a & b>')).toBe('&lt;a &amp; b&gt;')
  })
})
