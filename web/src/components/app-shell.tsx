import {
  Analytics01Icon,
  DashboardSpeed02Icon,
  Folder01Icon,
  Invoice01Icon,
  Logout01Icon,
  ServerStack01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Typography } from '@/components/ui/typography'
import { useAuth } from '@/lib/use-auth'

const navItems = [
  { to: '/', label: 'Обзор', icon: DashboardSpeed02Icon, exact: true },
  { to: '/analytics', label: 'Аналитика', icon: Analytics01Icon, exact: false },
  { to: '/projects', label: 'Проекты', icon: Folder01Icon, exact: false },
  { to: '/servers', label: 'Серверы', icon: ServerStack01Icon, exact: false },
  { to: '/clients', label: 'Клиенты', icon: UserGroupIcon, exact: false },
  { to: '/invoices', label: 'Счета', icon: Invoice01Icon, exact: false },
] as const

export function AppShell() {
  const auth = useAuth()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Typography variant="h6" className="px-2 py-1 group-data-[collapsible=icon]:hidden">
            Projects HQ
          </Typography>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Разделы</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = item.exact ? pathname === item.to : pathname.startsWith(item.to)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link to={item.to}>
                          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                          <Typography as="span" variant={isActive ? 'bodySmMedium' : 'bodySm'}>
                            {item.label}
                          </Typography>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <Typography variant="bodySm" tone="muted" truncate className="ml-auto">
            {auth.user?.email}
          </Typography>
          <Button type="button" variant="ghost" size="sm" onClick={() => void auth.logout()}>
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} data-icon="inline-start" />
            Выйти
          </Button>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
