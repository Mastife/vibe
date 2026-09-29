const transliteration: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(value: string): string {
  const transliterated = [...value.toLowerCase()].map((char) => transliteration[char] ?? char).join('')
  const slug = transliterated
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')

  return slug.length >= 2 ? slug : `project-${slug}`.replace(/-$/, '')
}

/** Returns `base`, or `base-2`, `base-3`, ... until `isTaken` says the candidate is free. */
export async function uniqueSlug(base: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
  if (!(await isTaken(base))) return base

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 64 - String(suffix).length - 1)}-${suffix}`
    if (!(await isTaken(candidate))) return candidate
  }

  throw new Error(`Could not find a free slug for "${base}"`)
}
