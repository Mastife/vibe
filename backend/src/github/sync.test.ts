import { describe, expect, test } from 'bun:test'

import { parseGithubRepo } from './sync'

describe('parseGithubRepo', () => {
  test('extracts owner and repository from GitHub urls', () => {
    expect(parseGithubRepo('https://github.com/Mastife/moika')).toEqual({ owner: 'Mastife', repo: 'moika' })
    expect(parseGithubRepo('https://github.com/Mastife/moika.git/')).toEqual({ owner: 'Mastife', repo: 'moika' })
    expect(parseGithubRepo('https://www.github.com/Mastife/map/tree/main')).toEqual({ owner: 'Mastife', repo: 'map' })
  })

  test('ignores non-GitHub and malformed urls', () => {
    expect(parseGithubRepo('https://gitlab.com/group/repo')).toBeNull()
    expect(parseGithubRepo('https://github.com/only-owner')).toBeNull()
    expect(parseGithubRepo(null)).toBeNull()
    expect(parseGithubRepo('not a url')).toBeNull()
  })
})
