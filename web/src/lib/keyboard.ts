import { useEffect, useRef } from 'react'

/** Typing in a field must never fire a shortcut, nor may a key pressed inside an open dialog. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="dialog"]') !== null
  )
}

/**
 * Calls `onPress` for a bare key press anywhere on the page. Matches `event.code`, so the shortcut
 * stays on the same physical key in the Russian layout.
 */
export function useHotkey(code: string, onPress: () => void) {
  const handler = useRef(onPress)
  useEffect(() => {
    handler.current = onPress
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== code || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      event.preventDefault()
      handler.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [code])
}

/** Ctrl+Enter (⌘+Enter on a Mac) sends the form the field belongs to. */
export function submitOnShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}
