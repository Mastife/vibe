const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DDTHH:mm` in the browser's timezone, the format `<input type="datetime-local">` reads. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The ISO timestamp a `datetime-local` value means in the browser's timezone, or null if it is not one. */
export function fromLocalInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString()
}
