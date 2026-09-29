import type { TagDto, TagMutationResponse } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import { AppError } from '../http/errors'

/** Tags live on `projects.tags`; this service treats them as a shared vocabulary across projects. */
export class TagsService {
  constructor(private readonly db: DbClient) {}

  async list(): Promise<TagDto[]> {
    return this.db.$queryRaw<TagDto[]>`
      SELECT tag AS name, count(*)::int AS count
      FROM projects, unnest(tags) AS tag
      GROUP BY tag
      ORDER BY count(*) DESC, tag ASC`
  }

  /** Renames the tag everywhere; projects that already had the new name keep a single copy. */
  async rename(from: string, to: string): Promise<TagMutationResponse> {
    if (from === to) return { updated: 0 }
    const updated = await this.db.$executeRaw`
      UPDATE projects
      SET tags = (
        SELECT coalesce(array_agg(tag ORDER BY position), '{}')
        FROM (
          SELECT DISTINCT ON (tag) tag, position
          FROM unnest(array_replace(tags, ${from}, ${to})) WITH ORDINALITY AS item(tag, position)
          ORDER BY tag, position
        ) deduped
      ),
      updated_at = now()
      WHERE ${from} = ANY(tags)`
    if (updated === 0) throw new AppError(404, 'NOT_FOUND', 'Тег не найден')
    return { updated }
  }

  async remove(name: string): Promise<TagMutationResponse> {
    const updated = await this.db.$executeRaw`
      UPDATE projects SET tags = array_remove(tags, ${name}), updated_at = now() WHERE ${name} = ANY(tags)`
    if (updated === 0) throw new AppError(404, 'NOT_FOUND', 'Тег не найден')
    return { updated }
  }
}
