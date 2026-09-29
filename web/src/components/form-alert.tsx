import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function FormAlert({ title = 'Не удалось сохранить', message }: { title?: string; message: string | null }) {
  if (!message) return null

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
