import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from './app'
import { createPrisma } from './db'
import { checkUrl } from './health/checker'
import { addBillingPeriods, addDays, parseDateOnly, toDateOnly, todayUtc } from './lib/dates'
import { createServices } from './services'
import { testEnv } from './test-support/env'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('projects hq API integration', () => {
  const env = testEnv({
    DATABASE_URL: databaseUrl!,
    ADMIN_EMAILS: 'second@example.com',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: '42',
  })
  const prisma = createPrisma(databaseUrl!)
  const targetState = { healthy: true }
  const target = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () => new Response(targetState.healthy ? 'ok' : 'down', { status: targetState.healthy ? 200 : 503 }),
  })
  const telegramMessages: string[] = []
  const notificationFetch = async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('api.telegram.org')) {
      telegramMessages.push((JSON.parse(String(init?.body)) as { text: string }).text)
      return new Response('{"ok":true}')
    }
    throw new Error(`Unexpected outbound request: ${String(input)}`)
  }
  const services = createServices(
    { env, prisma },
    {
      fetchImpl: notificationFetch,
      check: (url, options) => checkUrl(url, { ...options, readCertificateExpiry: async () => null }),
    },
  )
  const app = createApp({ env, prisma, services })

  beforeEach(async () => {
    await prisma.reminderLog.deleteMany()
    await prisma.domain.deleteMany()
    await prisma.invoice.deleteMany()
    await prisma.healthCheckRun.deleteMany()
    await prisma.project.deleteMany()
    await prisma.serverPayment.deleteMany()
    await prisma.server.deleteMany()
    await prisma.client.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    telegramMessages.length = 0
    targetState.healthy = true
  })

  afterAll(async () => {
    target.stop(true)
    await prisma.$disconnect()
  })

  async function api(method: string, path: string, body?: unknown, token?: string) {
    const response = await app.request(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'web',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }

  async function registerAdmin(email = 'owner@example.com') {
    const result = await api('POST', '/api/auth/register', { email, password: 'password123', displayName: 'Owner' })
    expect(result.status).toBe(201)
    return result.body.accessToken as string
  }

  test('opens registration only for the first admin or allowlisted emails', async () => {
    expect((await api('GET', '/api/auth/status')).body).toEqual({ registrationOpen: true, firstRun: true })

    await registerAdmin('owner@example.com')

    const stranger = await api('POST', '/api/auth/register', { email: 'stranger@example.com', password: 'password123' })
    expect(stranger.status).toBe(403)
    expect(stranger.body.error.code).toBe('FORBIDDEN')

    const allowlisted = await api('POST', '/api/auth/register', { email: 'Second@Example.com', password: 'password123' })
    expect(allowlisted.status).toBe(201)

    expect((await api('GET', '/api/auth/status')).body).toEqual({ registrationOpen: true, firstRun: false })
  })

  test('closes registration completely without an allowlist', async () => {
    const strictServices = createServices({ env: testEnv({ DATABASE_URL: databaseUrl! }), prisma })
    const strictApp = createApp({ env: testEnv({ DATABASE_URL: databaseUrl! }), prisma, services: strictServices })

    const first = await strictApp.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com', password: 'password123' }),
    })
    expect(first.status).toBe(201)

    const status = await strictApp.request('/api/auth/status')
    expect(await status.json()).toEqual({ registrationOpen: false, firstRun: false })
  })

  test('requires a valid session on every hq route', async () => {
    for (const path of ['/api/projects', '/api/servers', '/api/clients', '/api/invoices', '/api/domains', '/api/tags', '/api/dashboard']) {
      const anonymous = await api('GET', path)
      expect(anonymous.status).toBe(401)
      expect(anonymous.body.error.code).toBe('UNAUTHORIZED')
    }

    const forged = await api('GET', '/api/projects', undefined, 'not-a-real-token')
    expect(forged.status).toBe(401)

    const runAll = await api('POST', '/api/health/run')
    expect(runAll.status).toBe(401)
  })

  test('manages clients, servers, projects, and invoices end to end', async () => {
    const token = await registerAdmin()
    const today = todayUtc()
    const inThreeDays = toDateOnly(addDays(today, 3))

    const client = await api('POST', '/api/clients', { name: 'ООО Ромашка', email: 'pay@romashka.ru', telegram: '' }, token)
    expect(client.status).toBe(201)
    expect(client.body.client).toMatchObject({ name: 'ООО Ромашка', email: 'pay@romashka.ru', telegram: null, projectCount: 0, outstanding: [] })
    const clientId = client.body.client.id as string

    const server = await api(
      'POST',
      '/api/servers',
      { name: 'vps-1', provider: 'Timeweb', monthlyCost: '1500', paidUntil: inThreeDays },
      token,
    )
    expect(server.status).toBe(201)
    expect(server.body.server).toMatchObject({
      name: 'vps-1',
      monthlyCost: 1500,
      currency: 'KZT',
      paidUntil: inThreeDays,
      payment: { state: 'DUE_SOON', daysLeft: 3 },
    })
    const serverId = server.body.server.id as string

    const project = await api(
      'POST',
      '/api/projects',
      { name: 'Мойка Premium', clientId, serverId, productionUrl: target.url.toString(), tags: ['prod'] },
      token,
    )
    expect(project.status).toBe(201)
    expect(project.body.project).toMatchObject({
      slug: 'moyka-premium',
      status: 'ACTIVE',
      client: { id: clientId, name: 'ООО Ромашка' },
      server: { id: serverId, name: 'vps-1' },
      health: { status: 'UNKNOWN', uptime24h: null },
    })
    const projectId = project.body.project.id as string

    const duplicate = await api('POST', '/api/projects', { name: 'Другая', slug: 'moyka-premium' }, token)
    expect(duplicate.status).toBe(409)

    const autoSuffixed = await api('POST', '/api/projects', { name: 'Мойка Premium' }, token)
    expect(autoSuffixed.body.project.slug).toBe('moyka-premium-2')

    const invalid = await api('POST', '/api/projects', { name: '', productionUrl: 'ftp://nope' }, token)
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')

    const updated = await api('PATCH', `/api/projects/${projectId}`, { notes: 'VIP клиент', monthlyFee: '15000' }, token)
    expect(updated.status).toBe(200)
    expect(updated.body.project).toMatchObject({ notes: 'VIP клиент', monthlyFee: 15000, status: 'ACTIVE', tags: ['prod'] })

    const listed = await api('GET', '/api/projects', undefined, token)
    expect(listed.body.projects).toHaveLength(2)

    const serverList = await api('GET', '/api/servers', undefined, token)
    expect(serverList.body.servers[0].projects).toEqual([{ id: projectId, name: 'Мойка Premium', slug: 'moyka-premium' }])

    const invoice = await api(
      'POST',
      '/api/invoices',
      { clientId, projectId, title: 'Поддержка за сентябрь', amount: '4500', dueAt: toDateOnly(addDays(today, -1)) },
      token,
    )
    expect(invoice.status).toBe(201)
    expect(invoice.body.invoice).toMatchObject({
      clientName: 'ООО Ромашка',
      projectName: 'Мойка Premium',
      amount: 4500,
      status: 'SENT',
      isOverdue: true,
      paidAt: null,
    })
    const invoiceId = invoice.body.invoice.id as string

    const dashboard = await api('GET', '/api/dashboard', undefined, token)
    expect(dashboard.status).toBe(200)
    // Both are warnings, so the earlier due date (the overdue invoice) comes first.
    expect(dashboard.body.alerts.map((alert: { kind: string }) => alert.kind)).toEqual([
      'INVOICE_OVERDUE',
      'SERVER_PAYMENT_DUE',
      'PROJECTS_UNMONITORED',
    ])
    expect(dashboard.body.invoices).toMatchObject({ outstanding: [{ currency: 'KZT', amount: 4500 }], overdueCount: 1 })
    expect(dashboard.body.servers).toMatchObject({ total: 1, dueSoon: 1, monthlyCost: [{ currency: 'KZT', amount: 1500 }] })
    expect(dashboard.body.monitoredProjects.map((entry: { id: string }) => entry.id)).toEqual([projectId])
    expect(dashboard.body.upcomingServerPayments[0].id).toBe(serverId)

    const clientsWithDebt = await api('GET', '/api/clients', undefined, token)
    expect(clientsWithDebt.body.clients[0]).toMatchObject({ projectCount: 1, outstanding: [{ currency: 'KZT', amount: 4500 }] })

    const payment = await api(
      'POST',
      `/api/servers/${serverId}/payments`,
      { amount: 3000, paidAt: toDateOnly(today), periods: 2, note: 'Карта' },
      token,
    )
    expect(payment.status).toBe(201)
    const expectedPaidUntil = toDateOnly(addBillingPeriods(parseDateOnly(inThreeDays), 'MONTHLY', 2))
    expect(payment.body.server).toMatchObject({ paidUntil: expectedPaidUntil, payment: { state: 'OK' } })
    expect(payment.body.payments).toHaveLength(1)
    expect(payment.body.payments[0]).toMatchObject({
      amount: 3000,
      currency: 'KZT',
      periodStart: inThreeDays,
      periodEnd: expectedPaidUntil,
      note: 'Карта',
    })

    const removedPayment = await api(
      'DELETE',
      `/api/servers/${serverId}/payments/${payment.body.payments[0].id}`,
      undefined,
      token,
    )
    expect(removedPayment.status).toBe(200)
    expect(removedPayment.body.server.paidUntil).toBeNull()
    expect(removedPayment.body.payments).toHaveLength(0)

    const paid = await api('PATCH', `/api/invoices/${invoiceId}`, { status: 'PAID' }, token)
    expect(paid.body.invoice).toMatchObject({ status: 'PAID', paidAt: toDateOnly(today), isOverdue: false })

    const afterPayment = await api('GET', '/api/dashboard', undefined, token)
    expect(afterPayment.body.invoices).toMatchObject({
      outstanding: [],
      overdueCount: 0,
      paidLast30Days: [{ currency: 'KZT', amount: 4500 }],
    })

    const analytics = await api('GET', '/api/dashboard/analytics', undefined, token)
    expect(analytics.status).toBe(200)
    expect(analytics.body.currency).toBe('KZT')
    expect(analytics.body.health.days).toHaveLength(14)
    expect(analytics.body.health.projects.map((entry: { id: string }) => entry.id)).toEqual([projectId])
    expect(analytics.body.finance.months.at(-1)).toMatchObject({ month: toDateOnly(today).slice(0, 7), income: 4500 })
    expect(analytics.body.finance.clientDebts).toEqual([])

    const blockedDelete = await api('DELETE', `/api/clients/${clientId}`, undefined, token)
    expect(blockedDelete.status).toBe(409)

    expect((await api('DELETE', `/api/invoices/${invoiceId}`, undefined, token)).status).toBe(204)
    expect((await api('DELETE', `/api/clients/${clientId}`, undefined, token)).status).toBe(204)

    const detached = await api('GET', `/api/projects/${projectId}`, undefined, token)
    expect(detached.body.project.clientId).toBeNull()
    expect(detached.body.invoices).toEqual([])

    expect((await api('GET', `/api/projects/${clientId}`, undefined, token)).status).toBe(404)
    expect((await api('GET', '/api/projects/not-a-uuid', undefined, token)).status).toBe(400)
  })

  test('runs health checks, keeps history, and notifies on transitions', async () => {
    const token = await registerAdmin()
    const created = await api('POST', '/api/projects', { name: 'Gifty', productionUrl: target.url.toString() }, token)
    const projectId = created.body.project.id as string

    const unmonitored = await api('POST', '/api/projects', { name: 'Handi' }, token)
    const noUrl = await api('POST', `/api/projects/${unmonitored.body.project.id}/check`, undefined, token)
    expect(noUrl.status).toBe(400)

    const first = await api('POST', `/api/projects/${projectId}/check`, undefined, token)
    expect(first.status).toBe(200)
    expect(first.body.run).toMatchObject({ ok: true, statusCode: 200, error: null })
    expect(first.body.project.health).toMatchObject({ status: 'UP', statusCode: 200, uptime24h: 100, uptime7d: 100 })
    expect(telegramMessages).toEqual([])

    targetState.healthy = false
    const batch = await api('POST', '/api/health/run', undefined, token)
    expect(batch.body).toEqual({ checked: 1, up: 0, down: 1 })
    expect(telegramMessages).toHaveLength(1)
    expect(telegramMessages[0]).toContain('Gifty</b> недоступен')
    expect(telegramMessages[0]).toContain('HTTP 503')

    const stillDown = await api('POST', `/api/projects/${projectId}/check`, undefined, token)
    expect(stillDown.body.project.health).toMatchObject({ status: 'DOWN', error: 'HTTP 503' })
    expect(telegramMessages).toHaveLength(1)

    const dashboard = await api('GET', '/api/dashboard', undefined, token)
    expect(dashboard.body.projects).toMatchObject({ up: 0, down: 1, unknown: 1 })
    expect(dashboard.body.alerts[0]).toMatchObject({ kind: 'PROJECT_DOWN', severity: 'critical', entityId: projectId })

    targetState.healthy = true
    const recovered = await api('POST', `/api/projects/${projectId}/check`, undefined, token)
    expect(recovered.body.project.health.status).toBe('UP')
    expect(recovered.body.project.health.uptime24h).toBe(50)
    expect(telegramMessages).toHaveLength(2)
    expect(telegramMessages[1]).toContain('снова работает')

    const detail = await api('GET', `/api/projects/${projectId}`, undefined, token)
    expect(detail.body.healthRuns).toHaveLength(4)
    expect(detail.body.healthRuns[0].ok).toBe(true)

    const analytics = await api('GET', '/api/dashboard/analytics', undefined, token)
    expect(analytics.body.health.daily.at(-1)).toMatchObject({ checks: 4, failures: 2, uptime: 50 })
    expect(analytics.body.health.projects).toHaveLength(1)
    expect(analytics.body.health.projects[0]).toMatchObject({ id: projectId, status: 'UP', uptime24h: 50 })
    expect(analytics.body.health.projects[0].daily.at(-1)).toBe(50)
    expect(analytics.body.health.statusCounts).toEqual({ up: 1, down: 0, unknown: 0 })
  })

  test('holds auto-invoicing during a pilot and resumes only after a decision to continue', async () => {
    const token = await registerAdmin()
    const today = todayUtc()
    const client = await api('POST', '/api/clients', { name: 'G-service' }, token)
    const created = await api(
      'POST',
      '/api/projects',
      {
        name: 'Moika',
        clientId: client.body.client.id,
        monthlyFee: 25000,
        autoInvoice: true,
        billingDay: Math.min(today.getUTCDate(), 28),
        pilotStartsAt: toDateOnly(addDays(today, -10)),
        pilotEndsAt: toDateOnly(today),
      },
      token,
    )
    expect(created.status).toBe(201)
    expect(created.body.project.pilot).toMatchObject({ blocksInvoicing: true })
    const projectId = created.body.project.id as string

    // Last pilot day, even with the decision already made: still free.
    await api('PATCH', `/api/projects/${projectId}`, { pilotOutcome: 'CONTINUE' }, token)
    expect(await services.billingService.issueDue()).toEqual({ issued: 0 })

    // Pilot over but declined: no invoice.
    const ended = toDateOnly(addDays(today, -1))
    await api('PATCH', `/api/projects/${projectId}`, { pilotEndsAt: ended, pilotOutcome: 'DECLINE' }, token)
    expect(await services.billingService.issueDue()).toEqual({ issued: 0 })

    const resumed = await api('PATCH', `/api/projects/${projectId}`, { pilotOutcome: 'CONTINUE' }, token)
    expect(resumed.body.project.pilot).toMatchObject({ state: 'DECIDED', blocksInvoicing: false })
    expect(await services.billingService.issueDue()).toEqual({ issued: 1 })
  })

  test('auto-invoices a subscription once per month and requires a client and a fee', async () => {
    const token = await registerAdmin()
    const today = todayUtc()
    const period = toDateOnly(today).slice(0, 7)
    const client = await api('POST', '/api/clients', { name: 'BROFOOD' }, token)
    const clientId = client.body.client.id as string

    const incomplete = await api('POST', '/api/projects', { name: 'Handi', autoInvoice: true }, token)
    expect(incomplete.status).toBe(400)
    expect(incomplete.body.error.message).toContain('укажите клиента')

    const created = await api(
      'POST',
      '/api/projects',
      { name: 'Handi', clientId, monthlyFee: 60000, autoInvoice: true, billingDay: Math.min(today.getUTCDate(), 28) },
      token,
    )
    expect(created.status).toBe(201)
    expect(created.body.project).toMatchObject({ autoInvoice: true, currency: 'KZT' })
    const projectId = created.body.project.id as string

    expect(await services.billingService.issueDue()).toEqual({ issued: 1 })
    expect(await services.billingService.issueDue()).toEqual({ issued: 0 })

    const invoices = await api('GET', `/api/invoices?projectId=${projectId}`, undefined, token)
    expect(invoices.body.invoices).toHaveLength(1)
    expect(invoices.body.invoices[0]).toMatchObject({
      clientId,
      amount: 60000,
      currency: 'KZT',
      status: 'SENT',
      autoPeriod: period,
      issuedAt: toDateOnly(today),
      dueAt: toDateOnly(addDays(today, 10)),
    })
    expect(telegramMessages).toHaveLength(1)
    expect(telegramMessages[0]).toContain('Выставлены счета по абонплате')

    const detached = await api('PATCH', `/api/projects/${projectId}`, { clientId: null }, token)
    expect(detached.status).toBe(400)
    const disabled = await api('PATCH', `/api/projects/${projectId}`, { autoInvoice: false, clientId: null }, token)
    expect(disabled.status).toBe(200)
  })

  test('tracks domains and sends each payment reminder once per threshold', async () => {
    const token = await registerAdmin()
    const today = todayUtc()

    const domain = await api(
      'POST',
      '/api/domains',
      { name: 'NaviGo.help', expiresAt: toDateOnly(addDays(today, 5)), renewalCost: 9000 },
      token,
    )
    expect(domain.status).toBe(201)
    expect(domain.body.domain).toMatchObject({
      name: 'navigo.help',
      currency: 'KZT',
      renewal: { state: 'DUE_SOON', daysLeft: 5 },
    })
    const domainId = domain.body.domain.id as string

    expect((await api('POST', '/api/domains', { name: 'navigo.help' }, token)).status).toBe(409)
    expect((await api('POST', '/api/domains', { name: 'https://navigo.help/app' }, token)).status).toBe(400)

    await api(
      'POST',
      '/api/servers',
      { name: 'NaviGo', monthlyCost: 7300, paidUntil: toDateOnly(addDays(today, 2)) },
      token,
    )

    const dashboard = await api('GET', '/api/dashboard', undefined, token)
    expect(dashboard.body.alerts.map((alert: { kind: string }) => alert.kind)).toContain('DOMAIN_EXPIRING')

    expect(await services.remindersService.sendDue()).toEqual({ sent: 2 })
    expect(telegramMessages).toHaveLength(1)
    expect(telegramMessages[0]).toContain('Домен navigo.help: продлить через 5 дней')
    expect(telegramMessages[0]).toContain('Сервер NaviGo: оплатить через 2 дня')

    expect(await services.remindersService.sendDue()).toEqual({ sent: 0 })
    expect(telegramMessages).toHaveLength(1)

    await api('PATCH', `/api/domains/${domainId}`, { expiresAt: toDateOnly(addDays(today, 1)) }, token)
    expect(await services.remindersService.sendDue()).toEqual({ sent: 1 })
    expect(telegramMessages[1]).toContain('Домен navigo.help: продлить через 1 день')

    const list = await api('GET', '/api/domains', undefined, token)
    expect(list.body.domains).toHaveLength(1)
    expect((await api('DELETE', `/api/domains/${domainId}`, undefined, token)).status).toBe(204)
  })

  test('tracks a client pilot and reminds about the decision until it is recorded', async () => {
    const token = await registerAdmin()
    const today = todayUtc()
    const client = await api('POST', '/api/clients', { name: 'G-service' }, token)

    const backwards = await api(
      'POST',
      '/api/projects',
      { name: 'Moika', pilotStartsAt: toDateOnly(today), pilotEndsAt: toDateOnly(addDays(today, -1)) },
      token,
    )
    expect(backwards.status).toBe(400)

    const created = await api(
      'POST',
      '/api/projects',
      {
        name: 'Moika',
        clientId: client.body.client.id,
        pilotStartsAt: toDateOnly(addDays(today, -27)),
        pilotEndsAt: toDateOnly(addDays(today, 3)),
      },
      token,
    )
    expect(created.status).toBe(201)
    expect(created.body.project.pilot).toMatchObject({ state: 'ENDING', daysLeft: 3, outcome: null })
    const projectId = created.body.project.id as string

    const dashboard = await api('GET', '/api/dashboard', undefined, token)
    expect(dashboard.body.alerts.map((alert: { kind: string }) => alert.kind)).toContain('PILOT_ENDING')

    expect(await services.remindersService.sendDue()).toEqual({ sent: 1 })
    expect(telegramMessages.at(-1)).toContain('Пилот Moika (G-service): заканчивается через 3 дня')
    expect(await services.remindersService.sendDue()).toEqual({ sent: 0 })

    const decided = await api('PATCH', `/api/projects/${projectId}`, { pilotOutcome: 'CONTINUE' }, token)
    expect(decided.body.project.pilot).toMatchObject({ state: 'DECIDED', outcome: 'CONTINUE' })
    await api('PATCH', `/api/projects/${projectId}`, { pilotEndsAt: toDateOnly(addDays(today, 1)) }, token)
    expect(await services.remindersService.sendDue()).toEqual({ sent: 0 })

    const reopened = await api('PATCH', `/api/projects/${projectId}`, { pilotOutcome: null }, token)
    expect(reopened.body.project.pilot).toMatchObject({ state: 'ENDING', daysLeft: 1 })
    expect(await services.remindersService.sendDue()).toEqual({ sent: 1 })
  })

  test('lists, renames, and removes tags across every project', async () => {
    const token = await registerAdmin()
    await api('POST', '/api/projects', { name: 'Handi', tags: ['python', 'телеграм-бот', 'prod'] }, token)
    await api('POST', '/api/projects', { name: 'Moika', tags: ['react', 'prod'] }, token)
    await api('POST', '/api/projects', { name: 'Zapis', tags: ['bot', 'react'] }, token)

    const listed = await api('GET', '/api/tags', undefined, token)
    expect(listed.body.tags).toEqual([
      { name: 'prod', count: 2 },
      { name: 'react', count: 2 },
      { name: 'bot', count: 1 },
      { name: 'python', count: 1 },
      { name: 'телеграм-бот', count: 1 },
    ])

    // Renaming onto an existing tag merges without duplicates and keeps the original order.
    const renamed = await api('PATCH', `/api/tags/${encodeURIComponent('телеграм-бот')}`, { name: 'bot' }, token)
    expect(renamed.body).toEqual({ updated: 1 })
    const merged = await api('PATCH', '/api/tags/react', { name: 'bot' }, token)
    expect(merged.body).toEqual({ updated: 2 })

    const projects = await api('GET', '/api/projects', undefined, token)
    const tagsByName = Object.fromEntries(
      projects.body.projects.map((project: { name: string; tags: string[] }) => [project.name, project.tags]),
    )
    expect(tagsByName).toEqual({ Handi: ['python', 'bot', 'prod'], Moika: ['bot', 'prod'], Zapis: ['bot'] })

    expect((await api('DELETE', '/api/tags/prod', undefined, token)).body).toEqual({ updated: 2 })
    expect((await api('DELETE', '/api/tags/prod', undefined, token)).status).toBe(404)
    expect((await api('PATCH', '/api/tags/bot', { name: '  ' }, token)).status).toBe(400)
    expect((await api('GET', '/api/tags', undefined, token)).body.tags).toEqual([
      { name: 'bot', count: 3 },
      { name: 'python', count: 1 },
    ])
  })
})
