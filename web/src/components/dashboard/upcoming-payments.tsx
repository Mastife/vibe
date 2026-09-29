import type { InvoiceDto, ServerDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'

import { EmptyState } from '@/components/empty-state'
import { InvoiceStatusBadge, ServerPaymentBadge } from '@/components/status-badges'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Typography } from '@/components/ui/typography'
import { formatDate, formatMoney } from '@/lib/format'
import { billingPeriodShortLabels } from '@/lib/labels'

export function UpcomingServerPayments({ servers }: { servers: ServerDto[] }) {
  if (servers.length === 0) {
    return <EmptyState title="Нет сроков оплаты" description="Укажите серверам дату «оплачен до», чтобы видеть ближайшие платежи." />
  }

  return (
    <ItemGroup className="gap-2">
      {servers.map((server) => (
        <Item key={server.id} variant="outline" size="sm" asChild>
          <Link to="/servers/$serverId" params={{ serverId: server.id }}>
            <ItemContent>
              <ItemTitle>{server.name}</ItemTitle>
              <ItemDescription>
                {`${formatMoney(server.monthlyCost, server.currency)} / ${billingPeriodShortLabels[server.billingPeriod]}`}
                {server.provider ? ` · ${server.provider}` : ''}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ServerPaymentBadge
                state={server.payment.state}
                daysLeft={server.payment.daysLeft}
                paidUntil={server.paidUntil}
              />
            </ItemActions>
          </Link>
        </Item>
      ))}
    </ItemGroup>
  )
}

export function OpenInvoicesList({ invoices }: { invoices: InvoiceDto[] }) {
  if (invoices.length === 0) {
    return <EmptyState title="Нет открытых счетов" description="Все выставленные счета оплачены." />
  }

  return (
    <ItemGroup className="gap-2">
      {invoices.map((invoice) => (
        <Item key={invoice.id} variant="outline" size="sm">
          <ItemContent>
            <ItemTitle>{invoice.title}</ItemTitle>
            <ItemDescription>
              {invoice.clientName}
              {invoice.dueAt ? ` · срок ${formatDate(invoice.dueAt)}` : ''}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="flex-col items-end gap-1">
            <Typography variant="bodySmMedium">{formatMoney(invoice.amount, invoice.currency)}</Typography>
            <InvoiceStatusBadge invoice={invoice} />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
