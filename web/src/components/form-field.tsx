import type { PropsWithChildren } from 'react'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { errorId, hasErrors, type FormFieldError } from '@/lib/form'

type FormFieldProps = PropsWithChildren<{
  id: string
  label: string
  errors?: FormFieldError[]
  description?: string
}>

/** Label + control + validation error, wired with the ids assistive tech expects. */
export function FormField({ id, label, errors, description, children }: FormFieldProps) {
  return (
    <Field data-invalid={hasErrors(errors)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={errorId(errors, `${id}-error`)} errors={errors} />
    </Field>
  )
}
