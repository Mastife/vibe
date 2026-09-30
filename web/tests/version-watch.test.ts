import { expect, test } from 'bun:test'

import { canReloadSilently, extractEntryScript } from '../src/lib/version-watch'

test('extractEntryScript finds the hashed entry script of a built index.html', () => {
  const built = [
    '<!doctype html><html><head>',
    '<script type="module" crossorigin src="/assets/index-BXsLflzn.js"></script>',
    '<link rel="stylesheet" crossorigin href="/assets/index-BT-DygyN.css">',
    '</head><body><div id="root"></div></body></html>',
  ].join('')
  expect(extractEntryScript(built)).toBe('/assets/index-BXsLflzn.js')
})

test('extractEntryScript ignores the dev-server page and unrelated markup', () => {
  expect(extractEntryScript('<script type="module" src="/src/main.tsx"></script>')).toBeNull()
  expect(extractEntryScript('<p>Bad Gateway</p>')).toBeNull()
})

test('canReloadSilently only when nothing is open, focused, or typed', () => {
  const idle = { dialogOpen: false, editing: false, unsavedText: false }
  expect(canReloadSilently(idle)).toBe(true)
  expect(canReloadSilently({ ...idle, dialogOpen: true })).toBe(false)
  expect(canReloadSilently({ ...idle, editing: true })).toBe(false)
  expect(canReloadSilently({ ...idle, unsavedText: true })).toBe(false)
})
