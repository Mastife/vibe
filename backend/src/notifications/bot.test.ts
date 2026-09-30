import { beforeEach, describe, expect, test } from 'bun:test'
import type { JournalEntryDto, ProjectDto } from '@projects-hq/contracts'

import { JournalBot, journalNewCallback, type BotUpdate } from './bot'

const chatId = '42'
const now = new Date('2026-09-30T08:00:00Z')

const projects = [
  { id: 'p-moika', name: 'Moika', status: 'ACTIVE' },
  { id: 'p-navigo', name: 'NaviGo <beta>', status: 'DEVELOPMENT' },
  { id: 'p-old', name: 'Old', status: 'ARCHIVED' },
] as ProjectDto[]

type Call = { method: string; payload: Record<string, unknown> }

let calls: Call[]
let notes: Array<{ projectId: string; text: string }>
let updates: BotUpdate[] | null
let bot: JournalBot

function sent(): Array<{ text: string; buttons: string[] }> {
  return calls
    .filter((call) => call.method === 'sendMessage')
    .map((call) => {
      const markup = call.payload.reply_markup as { inline_keyboard: Array<Array<{ text: string }>> } | undefined
      return { text: call.payload.text as string, buttons: markup?.inline_keyboard.flat().map((button) => button.text) ?? [] }
    })
}

const text = (value: string, chat: string | number = 42): BotUpdate => ({ update_id: 1, message: { chat: { id: chat }, text: value } })
const press = (data: string, chat: string | number = 42): BotUpdate => ({
  update_id: 1,
  callback_query: { id: 'cb', data, message: { chat: { id: chat } } },
})

beforeEach(() => {
  calls = []
  notes = []
  updates = []
  bot = new JournalBot({
    api: async (method, payload) => {
      calls.push({ method, payload })
      return method === 'getUpdates' ? updates : true
    },
    chatId,
    projects: { list: async () => projects },
    journal: {
      create: async (payload) => {
        notes.push(payload)
        const project = projects.find((candidate) => candidate.id === payload.projectId)!
        return { project: { id: project.id, name: project.name, slug: project.id } } as JournalEntryDto
      },
    },
    appUrl: 'http://panel.test',
    retryDelayMs: 0,
  })
})

describe('journal bot', () => {
  test('button, then project, then text files a note', async () => {
    await bot.handle(press(journalNewCallback), now)
    expect(calls[0]).toMatchObject({ method: 'answerCallbackQuery' })
    // Archived projects are not offered.
    expect(sent()[0]).toEqual({ text: 'В журнал какого проекта записать?', buttons: ['Moika', 'NaviGo <beta>', 'Отмена'] })

    await bot.handle(press('journal:p:p-navigo'), now)
    expect(sent()[1]!.text).toContain('Напишите текст записи для «NaviGo &lt;beta&gt;»')

    await bot.handle(text('  Созвон: переносим релиз  '), now)
    expect(notes).toEqual([{ projectId: 'p-navigo', text: 'Созвон: переносим релиз' }])
    expect(sent()[2]).toEqual({
      text: '✅ Записано в журнал «NaviGo &lt;beta&gt;».',
      buttons: ['Открыть проект', '📝 Ещё запись'],
    })
    const markup = calls.at(-1)!.payload.reply_markup as { inline_keyboard: Array<Array<{ url?: string }>> }
    expect(markup.inline_keyboard[0]![0]!.url).toBe('http://panel.test/projects/p-navigo')

    // The note is filed once: the next message starts a new one instead of going to the same project.
    await bot.handle(text('Ещё мысль'), now)
    expect(notes).toHaveLength(1)
  })

  test('text first, then project files the kept text', async () => {
    await bot.handle(text('Клиент просит отчёт'), now)
    expect(notes).toEqual([])
    expect(sent()[0]!.text).toBe('Записать это в журнал? Выберите проект.')

    await bot.handle(press('journal:p:p-moika'), now)
    expect(notes).toEqual([{ projectId: 'p-moika', text: 'Клиент просит отчёт' }])
  })

  test('/note starts a note, /cancel drops it, unknown commands are ignored', async () => {
    await bot.handle(text('/note@projects_hq_bot'), now)
    await bot.handle(press('journal:p:p-moika'), now)
    await bot.handle(text('/cancel'), now)
    expect(sent().at(-1)!.text).toBe('Отменено.')

    const before = calls.length
    await bot.handle(text('/help'), now)
    expect(calls).toHaveLength(before)
    expect(notes).toEqual([])
  })

  test('a chosen project is forgotten after 15 minutes', async () => {
    await bot.handle(press('journal:p:p-moika'), now)
    await bot.handle(text('Поздний текст'), new Date(now.getTime() + 16 * 60_000))
    expect(notes).toEqual([])
    expect(sent().at(-1)!.text).toBe('Записать это в журнал? Выберите проект.')
  })

  test('ignores every chat except the configured one', async () => {
    await bot.handle(text('Чужое сообщение', 777), now)
    await bot.handle(press(journalNewCallback, 777), now)
    expect(calls).toEqual([])
  })

  test('reports a project that no longer exists', async () => {
    await bot.handle(press('journal:p:gone'), now)
    expect(sent().at(-1)!.text).toContain('не найден')
    expect(notes).toEqual([])
  })

  test('poll acknowledges handled updates and reports idle or failed polls as nothing done', async () => {
    updates = [
      { update_id: 10, message: { chat: { id: 42 }, text: '/note' } },
      { update_id: 11, message: { chat: { id: 777 }, text: 'чужое' } },
    ]
    expect(await bot.poll()).toBe(2)
    expect(calls[0]).toMatchObject({ method: 'getUpdates', payload: { offset: 0 } })

    updates = []
    expect(await bot.poll()).toBe(false)
    expect(calls.at(-1)).toMatchObject({ method: 'getUpdates', payload: { offset: 12 } })

    updates = null
    expect(await bot.poll()).toBe(false)
  })
})
