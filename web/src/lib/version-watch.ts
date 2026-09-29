import { toast } from 'sonner'

const entryScriptPattern = /<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/

/** The hashed entry script a built `index.html` loads, e.g. `/assets/index-BXsLflzn.js`; null for dev pages. */
export function extractEntryScript(html: string): string | null {
  return html.match(entryScriptPattern)?.[1] ?? null
}

function loadedEntryScript(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
  return script ? new URL(script.src).pathname : null
}

async function latestEntryScript(): Promise<string | null> {
  const response = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } })
  return response.ok ? extractEntryScript(await response.text()) : null
}

/**
 * Phones keep a panel tab alive for days, so it can keep running a build that has since been
 * replaced. Every deploy changes the hashed entry script: when the tab comes back into view on a
 * newer build it reloads quietly (nothing is being typed at that moment); while it stays open it
 * offers a reload instead of interrupting.
 */
export function watchForNewVersion({ intervalMs = 5 * 60_000 } = {}): () => void {
  const loaded = loadedEntryScript()
  if (!loaded) return () => undefined // Vite dev server: modules hot-reload on their own.

  let offered = false
  const check = async (returning: boolean) => {
    try {
      const latest = await latestEntryScript()
      if (!latest || latest === loaded) return
      if (returning) {
        window.location.reload()
        return
      }
      if (offered) return
      offered = true
      toast('Вышла новая версия панели', {
        description: 'Обновите страницу, чтобы увидеть изменения.',
        duration: Number.POSITIVE_INFINITY,
        action: { label: 'Обновить', onClick: () => window.location.reload() },
      })
    } catch {
      // Offline or the server is restarting: try again on the next tick.
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void check(true)
  }
  // iOS restores tabs from the back/forward cache without a visibility change.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) void check(true)
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pageshow', onPageShow)
  const timer = window.setInterval(() => void check(false), intervalMs)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onPageShow)
    window.clearInterval(timer)
  }
}
