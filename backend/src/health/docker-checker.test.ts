import { describe, expect, test } from 'bun:test'

import { checkDockerOverSsh, dockerInspectCommand, parseDockerState, type CommandResult } from './docker-checker'

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '', timedOut: false })

describe('dockerInspectCommand', () => {
  test('never prompts and bounds the connect time', () => {
    const command = dockerInspectCommand('ubuntu@194.238.42.51', 'bonustar-bot', 10_000)
    expect(command.slice(0, 7)).toEqual([
      'ssh',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'StrictHostKeyChecking=accept-new',
    ])
    expect(command[7]).toBe('ubuntu@194.238.42.51')
    expect(command[8]).toEndWith(' bonustar-bot')
  })
})

describe('parseDockerState', () => {
  test('running without a healthcheck, or running and healthy, is fine', () => {
    expect(parseDockerState('running|\n', 'bot')).toBeNull()
    expect(parseDockerState('running|healthy', 'bot')).toBeNull()
  })

  test('anything else names the container state', () => {
    expect(parseDockerState('exited|', 'bot')).toBe('Контейнер bot: exited')
    expect(parseDockerState('running|unhealthy', 'bot')).toBe('Контейнер bot: unhealthy')
    expect(parseDockerState('', 'bot')).toBe('Контейнер bot: нет данных')
  })
})

describe('checkDockerOverSsh', () => {
  const options = (result: CommandResult | Error) => ({
    timeoutMs: 5000,
    run: async () => {
      if (result instanceof Error) throw result
      return result
    },
  })

  test('reports a running container as up', async () => {
    expect(await checkDockerOverSsh('u@h', 'bot', options(ok('running|')))).toMatchObject({
      ok: true,
      error: null,
      statusCode: null,
    })
  })

  test('explains a missing container, SSH failures, and timeouts', async () => {
    const missing = await checkDockerOverSsh(
      'u@h',
      'bot',
      options({ exitCode: 1, stdout: '', stderr: 'Error: No such object: bot\n', timedOut: false }),
    )
    expect(missing).toMatchObject({ ok: false, error: 'Контейнер bot не найден' })

    const denied = await checkDockerOverSsh(
      'u@h',
      'bot',
      options({ exitCode: 255, stdout: '', stderr: 'u@h: Permission denied (publickey).\n', timedOut: false }),
    )
    expect(denied).toMatchObject({ ok: false, error: 'SSH: u@h: Permission denied (publickey).' })

    const slow = await checkDockerOverSsh('u@h', 'bot', options({ exitCode: null, stdout: '', stderr: '', timedOut: true }))
    expect(slow).toMatchObject({ ok: false, error: 'Нет ответа по SSH за 5000 мс' })

    const crashed = await checkDockerOverSsh('u@h', 'bot', options(new Error('spawn ssh ENOENT')))
    expect(crashed).toMatchObject({ ok: false, error: 'SSH: spawn ssh ENOENT' })
  })
})
