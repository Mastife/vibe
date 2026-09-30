import { toast } from 'sonner'

const entryScriptPattern = /<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/

/** The hashed entry script a built `index.html` loads, e.g. `/assets/index-BXsLflzn.js`; null for dev pages. */
export function extractEntryScript(html: string): string | null {
  return html.match(entryScriptPattern)?.[1] ?? null
}

export type PageActivity = {
  /** A modal (form or confirmation) is open. */
  dialogOpen: boolean
  /** The cursor is in a text field, a select, or another editable control. */
  editing: boolean
  /** Some text field holds text that a reload would throw away. */
  unsavedText: boolean
}

/** A reload is only silent when it cannot interrupt typing or lose anything entered. */
export function canReloadSilently(activity: PageActivity): boolean {
  return !activity.dialogOpen && !activity.editing && !activity.unsavedText
}

const textInputSelector = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="date"]'

function readPageActivity(): PageActivity {
  const active = document.activeElement
  return {
    dialogOpen: document.querySelector('[role="dialog"], [role="alertdialog"]') !== null,
    editing:
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable),
    unsavedText: [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(textInputSelector)].some(
      (field) => field.value.trim() !== '',
    ),
  }
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
 * A panel tab stays open for days, so it can keep running a build that has since been replaced.
 * Every deploy changes the hashed entry script. A tab on an older build reloads by itself as soon as
 * a check (every minute, and whenever the tab comes back into view) finds nothing being typed and no
 * dialog open. Until then it offers the reload instead of interrupting.
 */
export function watchForNewVersion({ intervalMs = 60_000 } = {}): () => void {
  const loaded = loadedEntryScript()
  if (!loaded) return () => undefined // Vite dev server: modules hot-reload on their own.

  let offered = false
  const check = async () => {
    try {
      const latest = await latestEntryScript()
      if (!latest || latest === loaded) return
      if (canReloadSilently(readPageActivity())) {
        window.location.reload()
        return
      }
      if (offered) return
      offered = true
      toast('Вышла новая версия панели', {
        description: 'Страница обновится сама, когда вы закончите ввод.',
        duration: Number.POSITIVE_INFINITY,
        action: { label: 'Обновить сейчас', onClick: () => window.location.reload() },
      })
    } catch {
      // Offline or the server is restarting: try again on the next tick.
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void check()
  }
  // iOS restores tabs from the back/forward cache without a visibility change.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) void check()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pageshow', onPageShow)
  const timer = window.setInterval(() => void check(), intervalMs)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onPageShow)
    window.clearInterval(timer)
  }
}
