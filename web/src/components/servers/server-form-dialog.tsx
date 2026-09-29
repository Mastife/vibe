import { useForm } from '@tanstack/react-form'
import { serverCreateSchema, serverUpdateSchema, type ServerDto } from '@projects-hq/contracts'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { FormAlert } from '@/components/form-alert'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ApiRequestError } from '@/lib/api'
import { fieldNameGuard, toFieldErrors, type FieldErrorMap } from '@/lib/form'
import { billingPeriodLabels, serverStatusLabels } from '@/lib/labels'
import { useCreateServer, useUpdateServer } from '@/lib/queries'

type ServerDraft = {
  name: string
  provider: string
  host: string
  location: string
  specs: string
  panelUrl: string
  monthlyCost: string
  currency: string
  billingPeriod: string
  paidUntil: string
  status: string
  notes: string
}

type FieldName = keyof ServerDraft

const fieldNames = [
  'name',
  'provider',
  'host',
  'location',
  'specs',
  'panelUrl',
  'monthlyCost',
  'currency',
  'billingPeriod',
  'paidUntil',
  'status',
  'notes',
] as const satisfies readonly FieldName[]

const isFieldName = fieldNameGuard<FieldName>(fieldNames)

type TextSpec = { name: FieldName; label: string; placeholder?: string; type?: 'date'; inputMode?: 'decimal' }

const textFields: TextSpec[] = [
  { name: 'name', label: 'Название', placeholder: 'vps-1' },
  { name: 'provider', label: 'Провайдер', placeholder: 'Timeweb, Selectel, Hetzner' },
  { name: 'host', label: 'Хост / IP', placeholder: '91.200.10.5' },
  { name: 'location', label: 'Локация', placeholder: 'Москва' },
  { name: 'specs', label: 'Конфигурация', placeholder: '2 vCPU, 4 GB, 60 GB NVMe' },
  { name: 'panelUrl', label: 'Панель провайдера', placeholder: 'https://timeweb.cloud/my/servers' },
  { name: 'monthlyCost', label: 'Стоимость за период', placeholder: '1500', inputMode: 'decimal' },
  { name: 'currency', label: 'Валюта', placeholder: 'RUB' },
  { name: 'paidUntil', label: 'Оплачен до', type: 'date' },
]

function toDraft(server: ServerDto | undefined): ServerDraft {
  return {
    name: server?.name ?? '',
    provider: server?.provider ?? '',
    host: server?.host ?? '',
    location: server?.location ?? '',
    specs: server?.specs ?? '',
    panelUrl: server?.panelUrl ?? '',
    monthlyCost: server ? String(server.monthlyCost) : '',
    currency: server?.currency ?? 'RUB',
    billingPeriod: server?.billingPeriod ?? 'MONTHLY',
    paidUntil: server?.paidUntil ?? '',
    status: server?.status ?? 'ACTIVE',
    notes: server?.notes ?? '',
  }
}

type ServerFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: ServerDto
}

export function ServerFormDialog({ open, onOpenChange, server }: ServerFormDialogProps) {
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={server ? 'Изменить сервер' : 'Новый сервер'}
      description="Дата «оплачен до» и стоимость нужны для напоминаний об оплате."
    >
      <ServerForm server={server} onDone={() => onOpenChange(false)} />
    </EntityDialog>
  )
}

function ServerForm({ server, onDone }: { server?: ServerDto; onDone: () => void }) {
  const id = useId()
  const createServer = useCreateServer()
  const updateServer = useUpdateServer()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  const form = useForm({
    defaultValues: toDraft(server),
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = server ? serverUpdateSchema.safeParse(value) : serverCreateSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        if (server) {
          await updateServer.mutateAsync({ id: server.id, payload: result.data })
          toast.success('Сервер обновлён')
        } else {
          await createServer.mutateAsync(serverCreateSchema.parse(value))
          toast.success('Сервер добавлен')
        }
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось сохранить сервер')
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
                    type={spec.type}
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
          <form.Field
            name="billingPeriod"
            children={(field) => (
              <FormField id={`${id}-billingPeriod`} label="Период оплаты" errors={fieldErrors.billingPeriod}>
                <NativeSelect
                  id={`${id}-billingPeriod`}
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('billingPeriod')
                  }}
                >
                  {Object.entries(billingPeriodLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          />
          <form.Field
            name="status"
            children={(field) => (
              <FormField id={`${id}-status`} label="Статус" errors={fieldErrors.status}>
                <NativeSelect
                  id={`${id}-status`}
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('status')
                  }}
                >
                  {Object.entries(serverStatusLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          />
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
                {isSubmitting ? 'Сохраняем...' : server ? 'Сохранить' : 'Добавить сервер'}
              </Button>
            )}
          />
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
