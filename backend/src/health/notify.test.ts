import { describe, expect, test } from 'bun:test'

import { formatTransitions, type HealthTransition } from './notify'

const down = (name: string, error: string): HealthTransition => ({
  kind: 'down',
  projectId: `id-${name}`,
  name,
  error,
  target: `docker ${name}-bot @ ubuntu@194.238.42.51`,
})

const up = (name: string): HealthTransition => ({ kind: 'up', projectId: `id-${name}`, name, statusCode: 200, latencyMs: 80 })

describe('formatTransitions', () => {
  test('keeps the detailed message for a single project', () => {
    expect(formatTransitions([down('Handi', 'HTTP 503')], 'http://hq')).toEqual([
      '🔴 <b>Handi</b> недоступен\nHTTP 503\ndocker Handi-bot @ ubuntu@194.238.42.51\nhttp://hq/projects/id-Handi',
    ])
    expect(formatTransitions([up('Handi')])).toEqual(['🟢 <b>Handi</b> снова работает (HTTP 200, 80 мс)'])
  })

  test('merges projects that failed for the same reason into one message', () => {
    const ssh = 'Нет ответа по SSH за 10000 мс'
    const messages = formatTransitions(
      [down('bonustar', ssh), down('BF_Dashboard', ssh), down('Handi', ssh), down('Moika', 'HTTP 502')],
      'http://hq',
    )
    expect(messages).toHaveLength(2)
    expect(messages[0]).toBe(
      '🔴 Недоступны 3 проекта — одна причина:\nНет ответа по SSH за 10000 мс\n• <b>BF_Dashboard</b>\n• <b>bonustar</b>\n• <b>Handi</b>\nhttp://hq',
    )
    expect(messages[1]).toStartWith('🔴 <b>Moika</b> недоступен\nHTTP 502')
  })

  test('announces several recoveries at once and says nothing when nothing changed', () => {
    expect(formatTransitions([up('bonustar'), up('BF_Dashboard'), up('Handi')])).toEqual([
      '🟢 Снова работают: <b>BF_Dashboard</b>, <b>bonustar</b>, <b>Handi</b>',
    ])
    expect(formatTransitions([])).toEqual([])
  })
})
