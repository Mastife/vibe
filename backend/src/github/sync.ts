import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import type { FetchLike } from '../lib/fetch'

export type GithubRepoRef = { owner: string; repo: string }

export function parseGithubRepo(url: string | null | undefined): GithubRepoRef | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') return null
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean)
    if (!owner || !repo) return null
    return { owner, repo: repo.replace(/\.git$/, '') }
  } catch {
    return null
  }
}

type GithubRepoResponse = {
  pushed_at?: string | null
  open_issues_count?: number | null
}

export type GithubSyncResult = { synced: number; skipped: number; failed: number }

/** Refreshes last-push and open-issue counters for projects linked to GitHub repositories. */
export async function syncGithubRepos(
  db: DbClient,
  env: Pick<AppEnv, 'GITHUB_TOKEN'>,
  fetchImpl: FetchLike = fetch,
  now: Date = new Date(),
): Promise<GithubSyncResult> {
  const projects = await db.project.findMany({
    where: { status: { not: 'ARCHIVED' }, repoUrl: { not: null } },
    select: { id: true, name: true, repoUrl: true },
  })

  const result: GithubSyncResult = { synced: 0, skipped: 0, failed: 0 }

  for (const project of projects) {
    const ref = parseGithubRepo(project.repoUrl)
    if (!ref) {
      result.skipped += 1
      continue
    }

    try {
      const response = await fetchImpl(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'projects-hq-monitor/1.0',
          ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        console.error(`GitHub sync for ${project.name}: HTTP ${response.status}`)
        result.failed += 1
        continue
      }

      const data = (await response.json()) as GithubRepoResponse
      await db.project.update({
        where: { id: project.id },
        data: {
          repoPushedAt: data.pushed_at ? new Date(data.pushed_at) : null,
          repoOpenIssues: typeof data.open_issues_count === 'number' ? data.open_issues_count : null,
          repoSyncedAt: now,
        },
      })
      result.synced += 1
    } catch (error) {
      console.error(`GitHub sync for ${project.name} failed`, error)
      result.failed += 1
    }
  }

  return result
}
