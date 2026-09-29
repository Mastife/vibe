import type { z } from 'zod'

export type FormFieldError = { message?: string }
export type FieldErrorMap<TField extends string> = Partial<Record<TField, FormFieldError[]>>

/** Groups Zod issues by their top-level field so forms can render errors next to inputs. */
export function toFieldErrors<TField extends string>(issues: z.ZodIssue[], isField: (value: unknown) => value is TField) {
  return issues.reduce<FieldErrorMap<TField>>((errors, issue) => {
    const field = issue.path[0]
    if (!isField(field)) return errors
    errors[field] = [...(errors[field] ?? []), { message: issue.message }]
    return errors
  }, {})
}

export function hasErrors(errors: FormFieldError[] | undefined) {
  return Boolean(errors?.length)
}

export function errorId(errors: FormFieldError[] | undefined, id: string) {
  return hasErrors(errors) ? id : undefined
}

export function fieldNameGuard<TField extends string>(fields: readonly TField[]) {
  return (value: unknown): value is TField => typeof value === 'string' && (fields as readonly string[]).includes(value)
}

/** Splits "prod, vps" style input into trimmed, de-duplicated tags. */
export function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))]
}
