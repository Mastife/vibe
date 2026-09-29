import { useForm } from '@tanstack/react-form'
import { domainCreateSchema, domainUpdateSchema, type DomainDto, type ProjectDto } from '@projects-hq/contracts'
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
import { useCreateDomain, useUpdateDomain } from '@/lib/queries'

type DomainDraft = {
  name: string
  registrar: string
  projectId: string
  expiresAt: string
  renewalCost: string
  currency: string
  notes: string
}

type FieldName = keyof DomainDraft

const fieldNames = [
  'name',
  'registrar',
  'projectId',
  'expiresAt',
  'renewalCost',
  'currency',
  'notes',
] as const satisfies readonly FieldName[]

const isFieldName = fieldNameGuard<FieldName>(fieldNames)

type TextSpec = {
  name: Exclude<FieldName, 'projectId' | 'notes' | 'currency'>
  label: string
  placeholder?: string
  type?: 'date'
  inputMode?: 'decimal'
  description?: string
}

const textFields: TextSpec[] = [
  { name: 'name', label: 'Домен', placeholder: 'example.kz', description: 'Без https:// и пути.' },
  { name: 'registrar', label: 'Регистратор', placeholder: 'ps.kz, Namecheap' },
  {
    name: 'expiresAt',
    label: 'Оплачен до',
    type: 'date',
    description: 'Для .help, .com и других зон с RDAP дата подтянется сама.',
  },
  { name: 'renewalCost', label: 'Стоимость продления', placeholder: '9000', inputMode: 'decimal' },
]

function toDraft(domain: DomainDto | undefined): DomainDraft {
  return {
    name: domain?.name ?? '',
    registrar: domain?.registrar ?? '',
    projectId: domain?.projectId ?? '',
    expiresAt: domain?.expiresAt ?? '',
    renewalCost: domain ? String(domain.renewalCost) : '',
    currency: 'KZT',
    notes: domain?.notes ?? '',
  }
}

type DomainFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain?: DomainDto
  projects: ProjectDto[]
}

export function DomainFormDialog({ open, onOpenChange, domain, projects }: DomainFormDialogProps) {
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={domain ? 'Изменить домен' : 'Новый домен'}
      description="Дата окончания и стоимость нужны для напоминаний о продлении в Telegram."
    >
      <DomainForm domain={domain} projects={projects} onDone={() => onOpenChange(false)} />
    </EntityDialog>
  )
}

function DomainForm({ domain, projects, onDone }: { domain?: DomainDto; projects: ProjectDto[]; onDone: () => void }) {
  const id = useId()
  const createDomain = useCreateDomain()
  const updateDomain = useUpdateDomain()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  const form = useForm({
    defaultValues: toDraft(domain),
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = domain ? domainUpdateSchema.safeParse(value) : domainCreateSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        if (domain) {
          await updateDomain.mutateAsync({ id: domain.id, payload: result.data })
          toast.success('Домен обновлён')
        } else {
          await createDomain.mutateAsync(domainCreateSchema.parse(value))
          toast.success('Домен добавлен')
        }
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось сохранить домен')
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
          <Button type="submit" disabled={createDomain.isPending || updateDomain.isPending}>
            {domain ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
