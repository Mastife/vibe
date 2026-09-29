import { useForm } from '@tanstack/react-form'
import {
  projectCreateSchema,
  projectUpdateSchema,
  type ClientDto,
  type ProjectDto,
  type ServerDto,
} from '@projects-hq/contracts'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { FormAlert } from '@/components/form-alert'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiRequestError } from '@/lib/api'
import { fieldNameGuard, parseTags, toFieldErrors, type FieldErrorMap } from '@/lib/form'
import { projectStatusLabels } from '@/lib/labels'
import { useCreateProject, useUpdateProject } from '@/lib/queries'

type ProjectDraft = {
  name: string
  slug: string
  status: string
  clientId: string
  serverId: string
  productionUrl: string
  healthCheckUrl: string
  repoUrl: string
  monthlyFee: string
  currency: string
  autoInvoice: boolean
  billingDay: string
  tags: string
  description: string
  notes: string
}

type FieldName = keyof ProjectDraft

const fieldNames = [
  'name',
  'slug',
  'status',
  'clientId',
  'serverId',
  'productionUrl',
  'healthCheckUrl',
  'repoUrl',
  'monthlyFee',
  'currency',
  'autoInvoice',
  'billingDay',
  'tags',
  'description',
  'notes',
] as const satisfies readonly FieldName[]

const isFieldName = fieldNameGuard<FieldName>(fieldNames)

type TextSpec = { name: Exclude<FieldName, 'autoInvoice'>; label: string; placeholder?: string; description?: string; inputMode?: 'decimal' }

const textFields: TextSpec[] = [
  { name: 'productionUrl', label: 'Адрес продакшена', placeholder: 'https://app.example.com', description: 'Проверяется каждые несколько минут, если не задан отдельный health-check URL.' },
  { name: 'healthCheckUrl', label: 'Health-check URL', placeholder: 'https://api.example.com/health' },
  { name: 'repoUrl', label: 'Репозиторий', placeholder: 'https://github.com/owner/repo' },
  { name: 'monthlyFee', label: 'Ежемесячная плата клиента', placeholder: '15000', inputMode: 'decimal' },
  { name: 'tags', label: 'Теги', placeholder: 'prod, telegram-bot', description: 'Через запятую.' },
]

function toDraft(project: ProjectDto | undefined): ProjectDraft {
  return {
    name: project?.name ?? '',
    slug: project?.slug ?? '',
    status: project?.status ?? 'ACTIVE',
    clientId: project?.clientId ?? '',
    serverId: project?.serverId ?? '',
    productionUrl: project?.productionUrl ?? '',
    healthCheckUrl: project?.healthCheckUrl ?? '',
    repoUrl: project?.repoUrl ?? '',
    monthlyFee: project?.monthlyFee === null || project?.monthlyFee === undefined ? '' : String(project.monthlyFee),
    currency: 'KZT',
    autoInvoice: project?.autoInvoice ?? false,
    billingDay: String(project?.billingDay ?? 1),
    tags: project?.tags.join(', ') ?? '',
    description: project?.description ?? '',
    notes: project?.notes ?? '',
  }
}

type ProjectFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: ProjectDto
  clients: ClientDto[]
  servers: ServerDto[]
}

export function ProjectFormDialog({ open, onOpenChange, project, clients, servers }: ProjectFormDialogProps) {
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? 'Изменить проект' : 'Новый проект'}
      description="Адрес продакшена включает мониторинг доступности и SSL-сертификата."
    >
      <ProjectForm project={project} clients={clients} servers={servers} onDone={() => onOpenChange(false)} />
    </EntityDialog>
  )
}

function ProjectForm({
  project,
  clients,
  servers,
  onDone,
}: {
  project?: ProjectDto
  clients: ClientDto[]
  servers: ServerDto[]
  onDone: () => void
}) {
  const id = useId()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  const form = useForm({
    defaultValues: toDraft(project),
    onSubmit: async ({ value }) => {
      setFormError(null)
      const raw = { ...value, tags: parseTags(value.tags) }
      const result = project ? projectUpdateSchema.safeParse(raw) : projectCreateSchema.safeParse(raw)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        if (project) {
          await updateProject.mutateAsync({ id: project.id, payload: result.data })
          toast.success('Проект обновлён')
        } else {
          await createProject.mutateAsync(projectCreateSchema.parse(raw))
          toast.success('Проект создан')
        }
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось сохранить проект')
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
            name="name"
            children={(field) => (
              <FormField id={`${id}-name`} label="Название" errors={fieldErrors.name}>
                <Input
                  id={`${id}-name`}
                  value={field.state.value}
                  autoFocus
                  aria-invalid={Boolean(fieldErrors.name?.length)}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('name')
                  }}
                />
              </FormField>
            )}
          />
          <form.Field
            name="slug"
            children={(field) => (
              <FormField
                id={`${id}-slug`}
                label="Slug"
                errors={fieldErrors.slug}
                description={project ? undefined : 'Пусто — подберём из названия.'}
              >
                <Input
                  id={`${id}-slug`}
                  value={field.state.value}
                  placeholder="my-project"
                  aria-invalid={Boolean(fieldErrors.slug?.length)}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('slug')
                  }}
                />
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
                  {Object.entries(projectStatusLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          />
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
                  <NativeSelectOption value="">Без клиента</NativeSelectOption>
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
            name="serverId"
            children={(field) => (
              <FormField id={`${id}-server`} label="Сервер" errors={fieldErrors.serverId}>
                <NativeSelect
                  id={`${id}-server`}
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('serverId')
                  }}
                >
                  <NativeSelectOption value="">Без сервера</NativeSelectOption>
                  {servers.map((server) => (
                    <NativeSelectOption key={server.id} value={server.id}>
                      {server.name}
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
                <FormField
                  id={`${id}-${spec.name}`}
                  label={spec.label}
                  errors={fieldErrors[spec.name]}
                  description={spec.description}
                >
                  <Input
                    id={`${id}-${spec.name}`}
                    value={field.state.value}
                    placeholder={spec.placeholder}
                    inputMode={spec.inputMode}
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
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_10rem]">
          <form.Field
            name="autoInvoice"
            children={(field) => (
              <Field orientation="horizontal" data-invalid={Boolean(fieldErrors.autoInvoice?.length)}>
                <Switch
                  id={`${id}-autoInvoice`}
                  checked={field.state.value}
                  onCheckedChange={(checked) => {
                    field.handleChange(checked)
                    clearError('autoInvoice')
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-autoInvoice`}>Выставлять счёт автоматически</FieldLabel>
                  <FieldDescription>
                    Каждый месяц в выбранный день клиенту выставляется счёт на ежемесячную плату, в Telegram приходит
                    уведомление. Нужны клиент и сумма.
                  </FieldDescription>
                  <FieldError errors={fieldErrors.autoInvoice} />
                </FieldContent>
              </Field>
            )}
          />
          <form.Field
            name="billingDay"
            children={(field) => (
              <FormField id={`${id}-billingDay`} label="День месяца" errors={fieldErrors.billingDay}>
                <Input
                  id={`${id}-billingDay`}
                  type="number"
                  min={1}
                  max={28}
                  inputMode="numeric"
                  value={field.state.value}
                  aria-invalid={Boolean(fieldErrors.billingDay?.length)}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    clearError('billingDay')
                  }}
                />
              </FormField>
            )}
          />
        </div>
        <form.Field
          name="description"
          children={(field) => (
            <FormField id={`${id}-description`} label="Описание" errors={fieldErrors.description}>
              <Textarea
                id={`${id}-description`}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  clearError('description')
                }}
              />
            </FormField>
          )}
        />
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
                {isSubmitting ? 'Сохраняем...' : project ? 'Сохранить' : 'Создать проект'}
              </Button>
            )}
          />
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
