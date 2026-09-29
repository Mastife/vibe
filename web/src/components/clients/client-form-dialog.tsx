import { useForm } from '@tanstack/react-form'
import { clientCreateSchema, clientUpdateSchema, type ClientDto } from '@projects-hq/contracts'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { FormAlert } from '@/components/form-alert'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiRequestError } from '@/lib/api'
import { fieldNameGuard, toFieldErrors, type FieldErrorMap } from '@/lib/form'
import { useCreateClient, useUpdateClient } from '@/lib/queries'

type FieldName = 'name' | 'contactName' | 'email' | 'phone' | 'telegram' | 'notes'
const isFieldName = fieldNameGuard<FieldName>(['name', 'contactName', 'email', 'phone', 'telegram', 'notes'])

const textFields: Array<{ name: Exclude<FieldName, 'notes'>; label: string; placeholder?: string; inputMode?: 'email' | 'tel' }> = [
  { name: 'name', label: 'Название', placeholder: 'ООО Ромашка' },
  { name: 'contactName', label: 'Контактное лицо', placeholder: 'Иван Петров' },
  { name: 'email', label: 'Email', placeholder: 'ivan@example.com', inputMode: 'email' },
  { name: 'phone', label: 'Телефон', placeholder: '+7 900 000-00-00', inputMode: 'tel' },
  { name: 'telegram', label: 'Telegram', placeholder: '@username' },
]

type ClientFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: ClientDto
}

export function ClientFormDialog({ open, onOpenChange, client }: ClientFormDialogProps) {
  return (
    <EntityDialog open={open} onOpenChange={onOpenChange} title={client ? 'Изменить клиента' : 'Новый клиент'}>
      <ClientForm client={client} onDone={() => onOpenChange(false)} />
    </EntityDialog>
  )
}

function ClientForm({ client, onDone }: { client?: ClientDto; onDone: () => void }) {
  const id = useId()
  const createClient = useCreateClient()
  const updateClient = useUpdateClient()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  const form = useForm({
    defaultValues: {
      name: client?.name ?? '',
      contactName: client?.contactName ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      telegram: client?.telegram ?? '',
      notes: client?.notes ?? '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = client ? clientUpdateSchema.safeParse(value) : clientCreateSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        if (client) {
          await updateClient.mutateAsync({ id: client.id, payload: result.data })
          toast.success('Клиент обновлён')
        } else {
          await createClient.mutateAsync(clientCreateSchema.parse(value))
          toast.success('Клиент добавлен')
        }
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось сохранить клиента')
      }
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {textFields.map((spec) => (
            <form.Field
              key={spec.name}
              name={spec.name}
              children={(field) => (
                <FormField id={`${id}-${spec.name}`} label={spec.label} errors={fieldErrors[spec.name]}>
                  <Input
                    id={`${id}-${spec.name}`}
                    value={field.state.value}
                    placeholder={spec.placeholder}
                    inputMode={spec.inputMode}
                    autoFocus={spec.name === 'name'}
                    aria-invalid={Boolean(fieldErrors[spec.name]?.length)}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearError(spec.name)
                    }}
                  />
                </FormField>
              )}
            />
          ))}
        </div>
        <form.Field
          name="notes"
          children={(field) => (
            <FormField id={`${id}-notes`} label="Заметки" errors={fieldErrors.notes}>
              <Textarea
                id={`${id}-notes`}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  clearError('notes')
                }}
              />
            </FormField>
          )}
        />

        <FormAlert message={formError} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Отмена
            </Button>
          </DialogClose>
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Сохраняем...' : client ? 'Сохранить' : 'Добавить клиента'}
              </Button>
            )}
          />
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
