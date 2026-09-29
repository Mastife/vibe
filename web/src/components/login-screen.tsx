import { useForm } from '@tanstack/react-form'
import {
  loginRequestSchema,
  registerRequestSchema,
  type LoginRequest,
  type RegisterRequest,
} from '@projects-hq/contracts'
import { useId, useState } from 'react'

import { FormAlert } from '@/components/form-alert'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/lib/api'
import { fieldNameGuard, toFieldErrors, type FieldErrorMap } from '@/lib/form'
import { useAuthStatus } from '@/lib/queries'
import { useAuth } from '@/lib/use-auth'

type AuthMode = 'login' | 'register'
type FieldName = 'displayName' | 'email' | 'password'
type AuthDraft = { email: string; password: string; displayName: string }

const isFieldName = fieldNameGuard<FieldName>(['displayName', 'email', 'password'])
const emptyDraft: AuthDraft = { email: '', password: '', displayName: '' }

export function LoginScreen() {
  const status = useAuthStatus()
  const [chosenMode, setChosenMode] = useState<AuthMode | null>(null)
  const [draft, setDraft] = useState<AuthDraft>(emptyDraft)

  const registrationOpen = status.data?.registrationOpen ?? false
  const firstRun = status.data?.firstRun ?? false
  const mode: AuthMode = chosenMode ?? (firstRun ? 'register' : 'login')

  function updateDraft(nextDraft: Partial<AuthDraft>) {
    setDraft((currentDraft) => ({ ...currentDraft, ...nextDraft }))
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="grid w-full max-w-md gap-6">
        <div className="grid gap-2 text-center">
          <Typography variant="h2">Projects HQ</Typography>
          <Typography tone="muted">
            {firstRun
              ? 'Панель ещё не настроена. Создайте первый аккаунт администратора.'
              : 'Панель управления проектами, серверами и оплатами.'}
          </Typography>
        </div>

        <Card aria-label="Вход">
          <CardHeader>
            <CardTitle>{mode === 'register' ? 'Создать аккаунт' : 'Вход'}</CardTitle>
            <CardDescription>
              {mode === 'register'
                ? 'Аккаунт получает полный доступ ко всем данным панели.'
                : 'Войдите под аккаунтом администратора.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {registrationOpen && (
              <Tabs
                value={mode}
                onValueChange={(nextMode) => {
                  if (nextMode === 'login' || nextMode === 'register') setChosenMode(nextMode)
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Войти</TabsTrigger>
                  <TabsTrigger value="register">Регистрация</TabsTrigger>
                </TabsList>
                <TabsContent value="login" />
                <TabsContent value="register" />
              </Tabs>
            )}
            {mode === 'register' && registrationOpen ? (
              <RegisterForm draft={draft} onDraftChange={updateDraft} />
            ) : (
              <LoginForm draft={draft} onDraftChange={updateDraft} />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

type AuthFormProps = {
  draft: AuthDraft
  onDraftChange: (draft: Partial<AuthDraft>) => void
}

function RegisterForm({ draft, onDraftChange }: AuthFormProps) {
  const auth = useAuth()
  const id = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: draft,
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = registerRequestSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        await auth.register(result.data as RegisterRequest)
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось создать аккаунт')
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
        <form.Field
          name="displayName"
          children={(field) => (
            <FormField id={`${id}-name`} label="Имя" errors={fieldErrors.displayName}>
              <Input
                id={`${id}-name`}
                name={field.name}
                value={field.state.value ?? ''}
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.displayName?.length)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  onDraftChange({ displayName: event.target.value })
                  setFieldErrors((errors) => ({ ...errors, displayName: undefined }))
                  setFormError(null)
                }}
              />
            </FormField>
          )}
        />
        <form.Field
          name="email"
          children={(field) => (
            <FormField id={`${id}-email`} label="Email" errors={fieldErrors.email}>
              <Input
                id={`${id}-email`}
                name={field.name}
                value={field.state.value}
                type="text"
                inputMode="email"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email?.length)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  onDraftChange({ email: event.target.value })
                  setFieldErrors((errors) => ({ ...errors, email: undefined }))
                  setFormError(null)
                }}
              />
            </FormField>
          )}
        />
        <form.Field
          name="password"
          children={(field) => (
            <FormField id={`${id}-password`} label="Пароль" errors={fieldErrors.password}>
              <Input
                id={`${id}-password`}
                name={field.name}
                value={field.state.value}
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password?.length)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  onDraftChange({ password: event.target.value })
                  setFieldErrors((errors) => ({ ...errors, password: undefined }))
                  setFormError(null)
                }}
              />
            </FormField>
          )}
        />

        <FormAlert title="Не удалось создать аккаунт" message={formError} />

        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Создаём...' : 'Создать аккаунт'}
            </Button>
          )}
        />
      </FieldGroup>
    </form>
  )
}

function LoginForm({ draft, onDraftChange }: AuthFormProps) {
  const auth = useAuth()
  const id = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<FieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: draft.email, password: draft.password },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const result = loginRequestSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues, isFieldName))
        return
      }
      setFieldErrors({})

      try {
        await auth.login(result.data as LoginRequest)
      } catch (caughtError) {
        setFormError(caughtError instanceof ApiRequestError ? caughtError.message : 'Не удалось войти')
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
        <form.Field
          name="email"
          children={(field) => (
            <FormField id={`${id}-email`} label="Email" errors={fieldErrors.email}>
              <Input
                id={`${id}-email`}
                name={field.name}
                value={field.state.value}
                type="text"
                inputMode="email"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email?.length)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  onDraftChange({ email: event.target.value })
                  setFieldErrors((errors) => ({ ...errors, email: undefined }))
                  setFormError(null)
                }}
              />
            </FormField>
          )}
        />
        <form.Field
          name="password"
          children={(field) => (
            <FormField id={`${id}-password`} label="Пароль" errors={fieldErrors.password}>
              <Input
                id={`${id}-password`}
                name={field.name}
                value={field.state.value}
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password?.length)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  onDraftChange({ password: event.target.value })
                  setFieldErrors((errors) => ({ ...errors, password: undefined }))
                  setFormError(null)
                }}
              />
            </FormField>
          )}
        />

        <FormAlert title="Не удалось войти" message={formError} />

        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Входим...' : 'Войти'}
            </Button>
          )}
        />
      </FieldGroup>
    </form>
  )
}
