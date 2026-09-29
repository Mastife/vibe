import type { HttpCheckResult } from './checker'

export type CommandResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }
export type CommandRunner = (command: string[], timeoutMs: number) => Promise<CommandResult>

export type CheckDockerOptions = { timeoutMs: number; run?: CommandRunner }

/** Runs a command without a shell; kills it on timeout. */
export const runCommand: CommandRunner = async (command, timeoutMs) => {
  const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, timeoutMs)
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  clearTimeout(timer)
  return { exitCode, stdout, stderr, timedOut }
}

/** `ssh` arguments that never prompt: key auth only, bounded connect time, first-seen host keys accepted. */
export function dockerInspectCommand(sshHost: string, container: string, timeoutMs: number): string[] {
  const connectTimeout = Math.max(1, Math.floor(timeoutMs / 1000))
  return [
    'ssh',
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${connectTimeout}`,
    '-o',
    'StrictHostKeyChecking=accept-new',
    sshHost,
    // Host and container are validated by the contract (no spaces or shell metacharacters).
    `docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' ${container}`,
  ]
}

/** Turns `status|health` output into a verdict: running, and healthy when the image has a healthcheck. */
export function parseDockerState(output: string, container: string): string | null {
  const [status = '', health = ''] = output.trim().split('|')
  if (status !== 'running') return `Контейнер ${container}: ${status || 'нет данных'}`
  if (health && health !== 'healthy') return `Контейнер ${container}: ${health}`
  return null
}

/** One container probe over SSH; never throws, same result shape as the HTTP probe. */
export async function checkDockerOverSsh(
  sshHost: string,
  container: string,
  options: CheckDockerOptions,
): Promise<HttpCheckResult> {
  const run = options.run ?? runCommand
  const startedAt = performance.now()
  let error: string | null

  try {
    const result = await run(dockerInspectCommand(sshHost, container, options.timeoutMs), options.timeoutMs)
    if (result.timedOut) {
      error = `Нет ответа по SSH за ${options.timeoutMs} мс`
    } else if (result.exitCode !== 0) {
      const detail = result.stderr.trim().split('\n').at(-1) ?? ''
      error = /no such (object|container)/i.test(result.stderr)
        ? `Контейнер ${container} не найден`
        : `SSH: ${detail || `код ${result.exitCode}`}`.slice(0, 500)
    } else {
      error = parseDockerState(result.stdout, container)
    }
  } catch (caught) {
    error = `SSH: ${caught instanceof Error ? caught.message : String(caught)}`.slice(0, 500)
  }

  return {
    ok: error === null,
    statusCode: null,
    latencyMs: Math.round(performance.now() - startedAt),
    error,
    sslExpiresAt: null,
  }
}
