import { Add01Icon, Edit02Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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

import { ClientFormDialog } from '@/components/clients/client-form-dialog'
import { EntityDialog } from '@/components/entity-dialog'
import { FormAlert } from '@/components/form-alert'
import { FormField } from '@/components/form-field'
import { TagsInput } from '@/components/projects/tags-input'
import { TagsManagerDialog } from '@/components/projects/tags-manager-dialog'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/lib/api'
import { fieldNameGuard, toFieldErrors, type FieldErrorMap } from '@/lib/form'
import { pilotOutcomeLabels, projectStatusLabels } from '@/lib/labels'
import { useCreateProject, useUpdateProject } from '@/lib/queries'

type ProjectDraft = {
  name: string
  slug: string
  status: string
  clientId: string
  serverId: string
  productionUrl: string
  healthCheckUrl: string
  sshHost: string
  dockerContainer: string
  repoUrl: string
  monthlyFee: string
  currency: string
  autoInvoice: boolean
  billingDay: string
  pilotStartsAt: string
  pilotEndsAt: string
  pilotOutcome: string
  tags: string[]
  description: string
  notes: string
}

type FieldName = keyof ProjectDraft

type TabKey = 'main' | 'monitoring' | 'money' | 'pilot' | 'notes'

/** Which tab owns each field, so a validation error can point at (and open) the right tab. */
const fieldTab: Record<FieldName, TabKey> = {
  name: 'main',
  slug: 'main',
  status: 'main',
  clientId: 'main',
  serverId: 'main',
  tags: 'main',
  description: 'main',
  productionUrl: 'monitoring',
  healthCheckUrl: 'monitoring',
  sshHost: 'monitoring',
  dockerContainer: 'monitoring',
  repoUrl: 'monitoring',
  monthlyFee: 'money',
  currency: 'money',
  autoInvoice: 'money',
  billingDay: 'money',
  pilotStartsAt: 'pilot',
  pilotEndsAt: 'pilot',
  pilotOutcome: 'pilot',
  notes: 'notes',
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'main', label: 'Основное' },
  { key: 'monitoring', label: 'Мониторинг' },
  { key: 'money', label: 'Деньги' },
  { key: 'pilot', label: 'Пилот' },
  { key: 'notes', label: 'Заметки' },
]

const isFieldName = fieldNameGuard<FieldName>(Object.keys(fieldTab) as FieldName[])

type UrlSpec = { name: 'productionUrl' | 'healthCheckUrl' | 'repoUrl'; label: string; placeholder: string; description?: string }

const urlFields: UrlSpec[] = [
  {
    name: 'productionUrl',
    label: 'Адрес продакшена',
    placeholder: 'https://app.example.com',
    description: 'Проверяется каждые несколько минут, если не задан отдельный health-check URL.',
  },
  { name: 'healthCheckUrl', label: 'Health-check URL', placeholder: 'https://api.example.com/health' },
  {
    name: 'repoUrl',
    label: 'Репозиторий',
    placeholder: 'https://github.com/owner/repo',
    description: 'По ссылке на GitHub подтягиваются дата последнего push и открытые issues.',
  },
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
    sshHost: project?.sshHost ?? '',
    dockerContainer: project?.dockerContainer ?? '',
    repoUrl: project?.repoUrl ?? '',
    monthlyFee: project?.monthlyFee === null || project?.monthlyFee === undefined ? '' : String(project.monthlyFee),
    currency: 'KZT',
    autoInvoice: project?.autoInvoice ?? false,
    billingDay: String(project?.billingDay ?? 1),
    pilotStartsAt: project?.pilot.startsAt ?? '',
    pilotEndsAt: project?.pilot.endsAt ?? '',
    pilotOutcome: project?.pilot.outcome ?? '',
    tags: project?.tags ?? [],
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
    <EntityDialog open={open} onOpenChange={onOpenChange} title={project ? `Проект «${project.name}»` : 'Новый проект'}>
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
  const [tab, setTab] = useState<TabKey>('main')
  const [clientDialog, setClientDialog] = useState<{ client?: ClientDto } | null>(null)
  const [tagsOpen, setTagsOpen] = useState(false)
  // A client created from here is selectable before the clients query refetches.
  const [createdClients, setCreatedClients] = useState<ClientDto[]>([])
  const clientOptions = [...clients, ...createdClients.filter((created) => !clients.some((c) => c.id === created.id))]

  function clearError(name: FieldName) {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
    setFormError(null)
  }

  function tabHasError(key: TabKey) {
    return (Object.keys(fieldErrors) as FieldName[]).some((name) => fieldTab[name] === key && fieldErrors[name]?.length)
  }

  const form = useForm({
    defaultValues: toDraft(project),
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = project ? projectUpdateSchema.safeParse(value) : projectCreateSchema.safeParse(value)
      if (!result.success) {
        const errors = toFieldErrors(result.error.issues, isFieldName)
        setFieldErrors(errors)
        const firstInvalid = tabs.find(({ key }) =>
          (Object.keys(errors) as FieldName[]).some((name) => fieldTab[name] === key && errors[name]?.length),
        )
        if (firstInvalid) setTab(firstInvalid.key)
        return
      }
      setFieldErrors({})

      try {
        if (project) {
          await updateProject.mutateAsync({ id: project.id, payload: result.data })
          toast.success('Проект обновлён')
        } else {
          await createProject.mutateAsync(projectCreateSchema.parse(value))
          toast.success('Проект создан')
        }
        onDone()
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось сохранить проект')
      }
    },
  })

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup className="gap-4">
          <Tabs value={tab} onValueChange={(next) => setTab(next as TabKey)} className="gap-4">
            <TabsList className="no-scrollbar w-full overflow-x-auto">
              {tabs.map(({ key, label }) => (
                <TabsTrigger key={key} value={key}>
                  {label}
                  {tabHasError(key) && <span aria-label="есть ошибки" className="size-1.5 rounded-full bg-destructive" />}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="main" className="grid gap-4">
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
                  children={(field) => {
                    const selected = clientOptions.find((client) => client.id === field.state.value)
                    return (
                      <FormField id={`${id}-client`} label="Клиент" errors={fieldErrors.clientId}>
                        <div className="flex gap-1">
                          <NativeSelect
                            id={`${id}-client`}
                            className="w-full min-w-0 flex-1"
                            value={field.state.value}
                            onChange={(event) => {
                              field.handleChange(event.target.value)
                              clearError('clientId')
                            }}
                          >
                            <NativeSelectOption value="">Без клиента</NativeSelectOption>
                            {clientOptions.map((client) => (
                              <NativeSelectOption key={client.id} value={client.id}>
                                {client.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          {selected && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              title="Изменить клиента"
                              onClick={() => setClientDialog({ client: selected })}
                            >
                              <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                              <Typography variant="srOnly">Изменить клиента</Typography>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Новый клиент"
                            onClick={() => setClientDialog({})}
                          >
                            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                            <Typography variant="srOnly">Новый клиент</Typography>
                          </Button>
                        </div>
                      </FormField>
                    )
                  }}
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
              </div>
              <form.Field
                name="tags"
                children={(field) => (
                  <Field data-invalid={Boolean(fieldErrors.tags?.length)}>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor={`${id}-tags`}>Теги</FieldLabel>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTagsOpen(true)}>
                        <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} data-icon="inline-start" />
                        Управлять тегами
                      </Button>
                    </div>
                    <TagsInput
                      id={`${id}-tags`}
                      value={field.state.value}
                      invalid={Boolean(fieldErrors.tags?.length)}
                      onChange={(next) => {
                        field.handleChange(next)
                        clearError('tags')
                      }}
                    />
                    <FieldError errors={fieldErrors.tags} />
                  </Field>
                )}
              />
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
            </TabsContent>

            <TabsContent value="monitoring" className="grid gap-4">
              {urlFields.map((spec) => (
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
                        inputMode="url"
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
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <Typography variant="bodySmMedium" className="sm:col-span-2">
                  Docker-контейнер по SSH
                </Typography>
                {(
                  [
                    { name: 'sshHost', label: 'SSH-хост', placeholder: 'ubuntu@194.238.42.51' },
                    { name: 'dockerContainer', label: 'Контейнер', placeholder: 'bonustar-bot' },
                  ] as const
                ).map((spec) => (
                  <form.Field
                    key={spec.name}
                    name={spec.name}
                    children={(field) => (
                      <FormField id={`${id}-${spec.name}`} label={spec.label} errors={fieldErrors[spec.name]}>
                        <Input
                          id={`${id}-${spec.name}`}
                          value={field.state.value}
                          placeholder={spec.placeholder}
                          autoCapitalize="off"
                          spellCheck={false}
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
                <Typography variant="caption" tone="muted" className="sm:col-span-2">
                  Для ботов и сервисов без веб-адреса: панель заходит на сервер по SSH-ключу этого компьютера и
                  проверяет, что контейнер запущен (и здоров, если у него есть healthcheck). Health-check URL, если
                  указан, важнее.
                </Typography>
              </div>
              <form.Field
                name="slug"
                children={(field) => (
                  <FormField
                    id={`${id}-slug`}
                    label="Slug"
                    errors={fieldErrors.slug}
                    description={project ? 'Технический идентификатор проекта.' : 'Пусто — подберём из названия.'}
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
            </TabsContent>

            <TabsContent value="money" className="grid gap-4">
              <form.Field
                name="monthlyFee"
                children={(field) => (
                  <FormField id={`${id}-monthlyFee`} label="Ежемесячная плата клиента, ₸" errors={fieldErrors.monthlyFee}>
                    <Input
                      id={`${id}-monthlyFee`}
                      value={field.state.value}
                      placeholder="15000"
                      inputMode="decimal"
                      aria-invalid={Boolean(fieldErrors.monthlyFee?.length)}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        clearError('monthlyFee')
                      }}
                    />
                  </FormField>
                )}
              />
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
                          Каждый месяц в выбранный день клиенту выставляется счёт на эту сумму, в Telegram приходит
                          уведомление. Нужен клиент. Во время пилота и до решения «Продолжаем работу» счета не выставляются.
                        </FieldDescription>
                        {project?.autoInvoice && project.pilot.blocksInvoicing && (
                          <FieldDescription>Сейчас на паузе из-за пилота.</FieldDescription>
                        )}
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
            </TabsContent>

            <TabsContent value="pilot" className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    { name: 'pilotStartsAt', label: 'Начало пилота' },
                    { name: 'pilotEndsAt', label: 'Окончание пилота' },
                  ] as const
                ).map((spec) => (
                  <form.Field
                    key={spec.name}
                    name={spec.name}
                    children={(field) => (
                      <FormField id={`${id}-${spec.name}`} label={spec.label} errors={fieldErrors[spec.name]}>
                        <Input
                          id={`${id}-${spec.name}`}
                          type="date"
                          value={field.state.value}
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
                name="pilotOutcome"
                children={(field) => (
                  <FormField id={`${id}-pilotOutcome`} label="Решение клиента" errors={fieldErrors.pilotOutcome}>
                    <NativeSelect
                      id={`${id}-pilotOutcome`}
                      className="w-full"
                      value={field.state.value}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        clearError('pilotOutcome')
                      }}
                    >
                      <NativeSelectOption value="">Ещё не принято</NativeSelectOption>
                      {Object.entries(pilotOutcomeLabels).map(([value, label]) => (
                        <NativeSelectOption key={value} value={value}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormField>
                )}
              />
              <Typography variant="caption" tone="muted">
                За 7, 3 и 1 день до окончания и в последний день бот напомнит обсудить продолжение; после окончания — одно
                напоминание, если решение не отмечено.
              </Typography>
            </TabsContent>

            <TabsContent value="notes" className="grid gap-4">
              <form.Field
                name="notes"
                children={(field) => (
                  <FormField id={`${id}-notes`} label="Заметки" errors={fieldErrors.notes}>
                    <Textarea
                      id={`${id}-notes`}
                      className="min-h-48"
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
            </TabsContent>
          </Tabs>

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

      {/* Rendered outside the project <form>: React submit events bubble through portals. */}
      <ClientFormDialog
        open={clientDialog !== null}
        onOpenChange={(open) => {
          if (!open) setClientDialog(null)
        }}
        client={clientDialog?.client}
        onSaved={(saved) => {
          setCreatedClients((list) => [...list.filter((client) => client.id !== saved.id), saved])
          form.setFieldValue('clientId', saved.id)
          clearError('clientId')
        }}
      />
      <TagsManagerDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        onRenamed={(from, to) =>
          form.setFieldValue('tags', (current) => [...new Set(current.map((tag) => (tag === from ? to : tag)))])
        }
        onDeleted={(name) => form.setFieldValue('tags', (current) => current.filter((tag) => tag !== name))}
      />
    </>
  )
}
