import { plural } from '../lib/text'
import { escapeHtml } from '../notifications/telegram'

export type HealthTransition =
  | { kind: 'down'; projectId: string; name: string; error: string; target: string }
  | { kind: 'up'; projectId: string; name: string; statusCode: number | null; latencyMs: number }

/**
 * Telegram texts for one check run. Projects that went down for the same reason in the same run
 * (typically a whole server or its SSH being unreachable) share one message, and so do recoveries,
 * so a single incident does not arrive as a burst of near-identical alerts.
 */
export function formatTransitions(unordered: HealthTransition[], appUrl?: string): string[] {
  const messages: string[] = []
  // Checks run in parallel, so order by name for stable, readable messages.
  const transitions = [...unordered].sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const downsByError = new Map<string, Extract<HealthTransition, { kind: 'down' }>[]>()
  for (const transition of transitions) {
    if (transition.kind !== 'down') continue
    downsByError.set(transition.error, [...(downsByError.get(transition.error) ?? []), transition])
  }

  for (const [error, group] of downsByError) {
    if (group.length === 1) {
      const [only] = group
      messages.push(
        [
          `🔴 <b>${escapeHtml(only!.name)}</b> недоступен`,
          escapeHtml(error),
          escapeHtml(only!.target),
          appUrl ? `${appUrl}/projects/${only!.projectId}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      continue
    }
    messages.push(
      [
        `🔴 Недоступны ${group.length} ${plural(group.length, ['проект', 'проекта', 'проектов'])} — одна причина:`,
        escapeHtml(error),
        ...group.map((transition) => `• <b>${escapeHtml(transition.name)}</b>`),
        appUrl ?? null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  const ups = transitions.filter((transition) => transition.kind === 'up')
  if (ups.length === 1) {
    const [only] = ups
    messages.push(
      `🟢 <b>${escapeHtml(only!.name)}</b> снова работает (${only!.statusCode ? `HTTP ${only!.statusCode}, ` : ''}${only!.latencyMs} мс)`,
    )
  } else if (ups.length > 1) {
    messages.push(`🟢 Снова работают: ${ups.map((transition) => `<b>${escapeHtml(transition.name)}</b>`).join(', ')}`)
  }

  return messages
}
