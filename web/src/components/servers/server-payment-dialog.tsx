import { useForm } from '@tanstack/react-form'
import { serverPaymentCreateSchema, type ServerDto } from '@projects-hq/contracts'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { FormAlert } from '@/components/form-alert'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiRequestError } from '@/lib/api'
import { fieldNameGuard, toFieldErrors, type FieldErrorMap } from '@/lib/form'
import { formatDate, todayDateOnly } from '@/lib/format'
import { useRecordServerPayment } from '@/lib/queries'

type FieldName = 'amount' | 'currency' | 'paidAt' | 'periods' | 'note'
const isFieldName = fieldNameGuard<FieldName>(['amount', 'currency', 'paidAt', 'periods', 'note'])

type ServerPaymentDialogProps = {
  server: ServerDto | null
  onOpenChange: (open: boolean) => void
}

export function ServerPaymentDialog({ server, onOpenChange }: ServerPaymentDialogProps) {
  return (
    <EntityDialog
      open={server !== null}
      onOpenChange={onOpenChange}
      title={server ? `Оплата сервера ${server.name}` : 'Оплата сервера'}
      description={
        server?.paidUntil
          ? `Сейчас оплачен до ${formatDate(server.paidUntil)}; новый период начнётся с этой даты.`
          : 'Период оплаты начнётся с даты платежа.'
      }
    >
      {server && <ServerPaymentForm server={server} onDone={() => onOpenChange(false)} />}
    </EntityDialog>
  )
}

function ServerPaymentForm({ server, onDone }: { server: ServerDto; onDone: () => void }) {
  const id = useId()
  const recordPayment = useRecordServerPayment()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  const form = useForm({
    defaultValues: {
      amount: String(server.monthlyCost),
      currency: 'KZT',
      paidAt: todayDateOnly(),
      periods: '1',
      note: '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = serverPaymentCreateSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        const detail = await recordPayment.mutateAsync({ id: server.id, payload: result.data })
        toast.success(`Оплата записана: сервер оплачен до ${formatDate(detail.server.paidUntil)}`)
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось записать оплату')
      }
    },
  })

  const fields: Array<{ name: FieldName; label: string; type?: 'date' | 'number'; inputMode?: 'decimal' | 'numeric'; description?: string }> = [
    { name: 'amount', label: 'Сумма', inputMode: 'decimal' },
    { name: 'paidAt', label: 'Дата платежа', type: 'date' },
    { name: 'periods', label: 'Периодов оплачено', type: 'number', inputMode: 'numeric', description: 'Сколько периодов (месяцев, кварталов или лет) покрывает платёж.' },
    { name: 'note', label: 'Комментарий' },
  ]

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((spec) => (
            <form.Field
              key={spec.name}
              name={spec.name}
              children={(field) => (
                <FormField
                  id={`${id}-${spec.name}`}
                  label={spec.label}
                  errors={fieldErrors[spec.name]}
                  description={spec.description}
                >
                  <Input
                    id={`${id}-${spec.name}`}
                    value={field.state.value}
                    type={spec.type}
                    inputMode={spec.inputMode}
                    min={spec.type === 'number' ? 1 : undefined}
                    autoFocus={spec.name === 'amount'}
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
                {isSubmitting ? 'Записываем...' : 'Записать оплату'}
              </Button>
            )}
          />
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
