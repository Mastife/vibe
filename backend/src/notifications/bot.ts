import type { JournalEntryDto, ProjectDto } from '@projects-hq/contracts'

import type { FetchLike } from '../lib/fetch'
import { escapeHtml } from './telegram'

/** Calls one Bot API method and returns its `result`, or null when the call failed (already logged). */
export type BotApi = (method: string, payload: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>

export function createBotApi(botToken: string, fetchImpl: FetchLike = fetch): BotApi {
  return async (method, payload, timeoutMs = 10_000) => {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        console.error(`Telegram ${method} failed with HTTP ${response.status}`)
        return null
      }
      return ((await response.json()) as { result?: unknown }).result ?? null
    } catch (error) {
      console.error(`Telegram ${method} failed`, error instanceof Error ? error.message : error)
      return null
    }
  }
}

type Chat = { id: number | string }

export type BotUpdate = {
  update_id: number
  message?: { chat: Chat; text?: string; date?: number }
  callback_query?: { id: string; data?: string; message?: { chat: Chat } }
}

/** The button the pinned panel message carries; pressing it starts a journal note. */
export const journalNewCallback = 'journal:new'
const projectCallbackPrefix = 'journal:p:'
const cancelCallback = 'journal:cancel'

/** A half-finished note is forgotten after this long, so a stray message days later is not filed by surprise. */
const pendingTtlMs = 15 * 60_000
/** Messages that waited longer than this (the worker was offline) are dropped instead of answered out of the blue. */
const staleMessageMs = 10 * 60_000
const longPollSeconds = 25
const retryDelayMs = 10_000
const noteLimit = 4000

type Pending = { project?: { id: string; name: string }; draft?: string; expiresAt: number }

type BotDeps = {
  api: BotApi
  /** The only chat the bot listens to; everything else is ignored. */
  chatId: string
  projects: { list(): Promise<ProjectDto[]> }
  journal: { create(payload: { projectId: string; text: string }): Promise<JournalEntryDto> }
  appUrl?: string
  /** Pause after a failed poll; tests set it to zero. */
  retryDelayMs?: number
}

/**
 * Lets the owner write a project journal note from Telegram. Either order works: press the button
 * (or send /note), pick a project, send the text; or just send the text and then pick the project.
 */
export class JournalBot {
  private offset = 0
  private pending: Pending | null = null

  constructor(private readonly deps: BotDeps) {}

  /** Registers the commands shown in the chat's menu. */
  async setup(): Promise<void> {
    await this.deps.api('setMyCommands', {
      commands: [
        { command: 'note', description: 'Запись в журнал проекта' },
        { command: 'cancel', description: 'Отменить запись' },
      ],
    })
  }

  /** One long poll. Returns how many updates were handled, or false when there were none. */
  async poll(): Promise<number | false> {
    const updates = (await this.deps.api(
      'getUpdates',
      { offset: this.offset, timeout: longPollSeconds, allowed_updates: ['message', 'callback_query'] },
      (longPollSeconds + 10) * 1000,
    )) as BotUpdate[] | null

    if (!updates) {
      // Network trouble or another consumer of this bot: back off instead of spinning.
      await new Promise((resolve) => setTimeout(resolve, this.deps.retryDelayMs ?? retryDelayMs))
      return false
    }

    for (const update of updates) {
      this.offset = update.update_id + 1
      try {
        await this.handle(update)
      } catch (error) {
        console.error('Telegram update failed', error)
      }
    }
    return updates.length > 0 ? updates.length : false
  }

  async handle(update: BotUpdate, now = new Date()): Promise<void> {
    const query = update.callback_query
    if (query) {
      if (!this.fromOwner(query.message?.chat)) return
      await this.deps.api('answerCallbackQuery', { callback_query_id: query.id })
      await this.handleCallback(query.data ?? '', now)
      return
    }

    const message = update.message
    if (!message?.text || !this.fromOwner(message.chat)) return
    if (message.date !== undefined && now.getTime() - message.date * 1000 > staleMessageMs) return
    await this.handleText(message.text.trim(), now)
  }

  private fromOwner(chat: Chat | undefined): boolean {
    return chat !== undefined && String(chat.id) === this.deps.chatId
  }

  private async handleCallback(data: string, now: Date) {
    if (data === journalNewCallback) {
      this.pending = null
      await this.askProject('В журнал какого проекта записать?')
      return
    }
    if (data === cancelCallback) {
      this.pending = null
      await this.say('Отменено.')
      return
    }
    if (!data.startsWith(projectCallbackPrefix)) return

    const projectId = data.slice(projectCallbackPrefix.length)
    const project = (await this.deps.projects.list()).find((candidate) => candidate.id === projectId)
    if (!project) {
      await this.say('Этот проект не найден. Возможно, он удалён.')
      return
    }

    const draft = this.livePending(now)?.draft
    if (draft) {
      await this.save(project, draft)
      return
    }
    this.pending = { project: { id: project.id, name: project.name }, expiresAt: now.getTime() + pendingTtlMs }
    await this.say(`✍️ Напишите текст записи для «${escapeHtml(project.name)}» одним сообщением.\n/cancel — отмена.`)
  }

  private async handleText(text: string, now: Date) {
    const command = text.startsWith('/') ? text.split(/[\s@]/)[0] : null
    if (command === '/note' || command === '/start') {
      this.pending = null
      await this.askProject('В журнал какого проекта записать?')
      return
    }
    if (command === '/cancel') {
      this.pending = null
      await this.say('Отменено.')
      return
    }
    if (command) return

    const project = this.livePending(now)?.project
    if (project) {
      await this.save(project, text)
      return
    }
    // Text first: keep it and ask only for the project.
    this.pending = { draft: text, expiresAt: now.getTime() + pendingTtlMs }
    await this.askProject('Записать это в журнал? Выберите проект.')
  }

  private livePending(now: Date): Pending | null {
    if (this.pending && this.pending.expiresAt < now.getTime()) this.pending = null
    return this.pending
  }

  private async save(project: { id: string; name: string }, text: string) {
    this.pending = null
    const entry = await this.deps.journal.create({ projectId: project.id, text: text.slice(0, noteLimit) })
    const buttons = [{ text: '📝 Ещё запись', callback_data: journalNewCallback }]
    await this.say(`✅ Записано в журнал «${escapeHtml(entry.project.name)}».`, [
      this.deps.appUrl
        ? [{ text: 'Открыть проект', url: `${this.deps.appUrl}/projects/${project.id}` }, ...buttons]
        : buttons,
    ])
  }

  private async askProject(question: string) {
    const projects = (await this.deps.projects.list()).filter((project) => project.status !== 'ARCHIVED')
    if (projects.length === 0) {
      this.pending = null
      await this.say('В панели пока нет проектов.')
      return
    }
    const rows: Array<Array<Record<string, string>>> = []
    for (let index = 0; index < projects.length; index += 2) {
      rows.push(
        projects
          .slice(index, index + 2)
          .map((project) => ({ text: project.name, callback_data: `${projectCallbackPrefix}${project.id}` })),
      )
    }
    rows.push([{ text: 'Отмена', callback_data: cancelCallback }])
    await this.say(question, rows)
  }

  private async say(text: string, keyboard?: Array<Array<Record<string, string>>>) {
    await this.deps.api('sendMessage', {
      chat_id: this.deps.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    })
  }
}
