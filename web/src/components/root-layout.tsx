import { AppShell } from '@/components/app-shell'
import { LoginScreen } from '@/components/login-screen'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useAuth } from '@/lib/use-auth'

/** Gate for every route: session check, then login, then the authenticated shell. */
export function RootLayout() {
  const auth = useAuth()

  if (auth.isBootstrapping) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <Card className="w-fit">
          <CardContent className="flex items-center gap-3">
            <Spinner />
            <Typography variant="bodySm" tone="muted">
              Проверяем сессию...
            </Typography>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!auth.user) {
    return <LoginScreen />
  }

  return <AppShell />
}
