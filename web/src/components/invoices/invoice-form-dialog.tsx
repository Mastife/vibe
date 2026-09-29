import { useForm } from '@tanstack/react-form'
import {
  invoiceCreateSchema,
  invoiceUpdateSchema,
  type ClientDto,
  type InvoiceDto,
  type ProjectDto,
} from '@projects-hq/contracts'
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
import { invoiceStatusLabels } from '@/lib/labels'
import { todayDateOnly } from '@/lib/format'
import { useCreateInvoice, useUpdateInvoice } from '@/lib/queries'

type InvoiceDraft = {
  clientId: string
  projectId: string
  title: string
  amount: string
  currency: string
  status: string
  issuedAt: string
  dueAt: string
  paidAt: string
  note: string
}

type FieldName = keyof InvoiceDraft

const fieldNames = [
  'clientId',
  'projectId',
  'title',
  'amount',
  'currency',
  'status',
  'issuedAt',
  'dueAt',
  'paidAt',
  'note',
] as const satisfies readonly FieldName[]

const isFieldName = fieldNameGuard<FieldName>(fieldNames)

const textFields: Array<{ name: FieldName; label: string; placeholder?: string; type?: 'date'; inputMode?: 'decimal' }> = [
  { name: 'title', label: 'Назначение', placeholder: 'Поддержка за сентябрь' },
  { name: 'amount', label: 'Сумма', placeholder: '45000', inputMode: 'decimal' },
  { name: 'currency', label: 'Валюта', placeholder: 'RUB' },
  { name: 'issuedAt', label: 'Выставлен', type: 'date' },
  { name: 'dueAt', label: 'Срок оплаты', type: 'date' },
  { name: 'paidAt', label: 'Оплачен', type: 'date' },
]

function toDraft(invoice: InvoiceDto | undefined, defaults: { clientId?: string; projectId?: string }): InvoiceDraft {
  return {
    clientId: invoice?.clientId ?? defaults.clientId ?? '',
    projectId: invoice?.projectId ?? defaults.projectId ?? '',
    title: invoice?.title ?? '',
    amount: invoice ? String(invoice.amount) : '',
    currency: invoice?.currency ?? 'RUB',
    status: invoice?.status ?? 'SENT',
    issuedAt: invoice?.issuedAt ?? todayDateOnly(),
    dueAt: invoice?.dueAt ?? '',
    paidAt: invoice?.paidAt ?? '',
    note: invoice?.note ?? '',
  }
}

type InvoiceFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: InvoiceDto
  clients: ClientDto[]
  projects: ProjectDto[]
}

export function InvoiceFormDialog({ open, onOpenChange, invoice, clients, projects }: InvoiceFormDialogProps) {
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={invoice ? 'Изменить счёт' : 'Новый счёт'}
      description="Счета со сроком оплаты попадают в напоминания, когда срок подходит или прошёл."
    >
      <InvoiceForm invoice={invoice} clients={clients} projects={projects} onDone={() => onOpenChange(false)} />
    </EntityDialog>
  )
}

function InvoiceForm({
  invoice,
  clients,
  projects,
  onDone,
}: {
  invoice?: InvoiceDto
  clients: ClientDto[]
  projects: ProjectDto[]
  onDone: () => void
}) {
  const id = useId()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  const form = useForm({
    defaultValues: toDraft(invoice, { clientId: clients[0]?.id }),
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = invoice ? invoiceUpdateSchema.safeParse(value) : invoiceCreateSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        if (invoice) {
          await updateInvoice.mutateAsync({ id: invoice.id, payload: result.data })
          toast.success('Счёт обновлён')
        } else {
          await createInvoice.mutateAsync(invoiceCreateSchema.parse(value))
          toast.success('Счёт выставлен')
        }
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось сохранить счёт')
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
          <form.Field
            name="clientId"
            children={(field) => (
              <FormField id={`${id}-client`} label="Клиент" errors={fieldErrors.clientId}>
                <NativeSelect
                  id={`${id}-client`}
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('clientId')
                  }}
                >
                  <NativeSelectOption value="">Выберите клиента</NativeSelectOption>
                  {clients.map((client) => (
                    <NativeSelectOption key={client.id} value={client.id}>
                      {client.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          />
          <form.Field
            name="projectId"
            children={(field) => (
              <FormField id={`${id}-project`} label="Проект" errors={fieldErrors.projectId}>
                <NativeSelect
                  id={`${id}-project`}
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('projectId')
                  }}
                >
                  <NativeSelectOption value="">Без проекта</NativeSelectOption>
                  {projects.map((project) => (
                    <NativeSelectOption key={project.id} value={project.id}>
                      {project.name}
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
                  {Object.entries(invoiceStatusLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          />
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
                    autoFocus={spec.name === 'title'}
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
          name="note"
          children={(field) => (
            <FormField id={`${id}-note`} label="Комментарий" errors={fieldErrors.note}>
              <Textarea
                id={`${id}-note`}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  clearError('note')
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
                {isSubmitting ? 'Сохраняем...' : invoice ? 'Сохранить' : 'Выставить счёт'}
              </Button>
            )}
          />
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
