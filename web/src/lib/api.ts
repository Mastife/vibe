import {
  apiErrorSchema,
  authResponseSchema,
  authStatusResponseSchema,
  clientListResponseSchema,
  clientResponseSchema,
  analyticsResponseSchema,
  dashboardResponseSchema,
  domainListResponseSchema,
  domainResponseSchema,
  domainSyncResponseSchema,
  healthCheckResponseSchema,
  healthRunAllResponseSchema,
  invoiceListResponseSchema,
  invoiceResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  meResponseSchema,
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  registerRequestSchema,
  serverDetailResponseSchema,
  serverListResponseSchema,
  serverResponseSchema,
  type AuthResponse,
  type AuthStatusResponse,
  type ClientCreatePayload,
  type ClientListResponse,
  type ClientResponse,
  type ClientUpdatePayload,
  type AnalyticsResponse,
  type DashboardResponse,
  type DomainCreatePayload,
  type DomainListResponse,
  type DomainResponse,
  type DomainSyncResponse,
  type DomainUpdatePayload,
  type HealthCheckResponse,
  type HealthRunAllResponse,
  type InvoiceCreatePayload,
  type InvoiceListQuery,
  type InvoiceListResponse,
  type InvoiceResponse,
  type InvoiceUpdatePayload,
  type LoginRequest,
  type LogoutRequest,
  type MeResponse,
  type ProjectCreatePayload,
  type ProjectDetailResponse,
  type ProjectListResponse,
  type ProjectResponse,
  type ProjectUpdatePayload,
  type RefreshRequest,
  type RefreshResponse,
  type RegisterRequest,
  type ServerCreatePayload,
  type ServerDetailResponse,
  type ServerListResponse,
  type ServerPaymentCreatePayload,
  type ServerResponse,
  type ServerUpdatePayload,
} from '@projects-hq/contracts'
import type { z } from 'zod'

const apiBaseUrl = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

type ApiClientOptions = {
  getAccessToken: () => string | null
  setAccessToken: (accessToken: string | null) => void
  onAuthExpired?: () => void | Promise<void>
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  retryOnUnauthorized?: boolean
  accessTokenOverride?: string
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export class ApiClient {
  private readonly options: ApiClientOptions
  private refreshPromise: Promise<RefreshResponse> | null = null

  constructor(options: ApiClientOptions) {
    this.options = options
  }

  // Auth

  authStatus(): Promise<AuthStatusResponse> {
    return this.request('/api/auth/status', authStatusResponseSchema, { auth: false })
  }

  register(input: RegisterRequest): Promise<AuthResponse> {
    const payload = registerRequestSchema.parse(input)
    return this.request('/api/auth/register', authResponseSchema, {
      method: 'POST',
      body: payload,
      auth: false,
    })
  }

  login(input: LoginRequest): Promise<AuthResponse> {
    const payload = loginRequestSchema.parse(input)
    return this.request('/api/auth/login', authResponseSchema, {
      method: 'POST',
      body: payload,
      auth: false,
    })
  }

  refresh(input: RefreshRequest = {}): Promise<RefreshResponse> {
    const payload = refreshRequestSchema.parse(input)
    return this.request('/api/auth/refresh', refreshResponseSchema, {
      method: 'POST',
      body: payload,
      auth: false,
      retryOnUnauthorized: false,
    })
  }

  me(): Promise<MeResponse> {
    return this.request('/api/auth/me', meResponseSchema, {
      auth: true,
    })
  }

  async logout(input: LogoutRequest = {}) {
    const payload = logoutRequestSchema.parse(input)
    await this.rawRequest('/api/auth/logout', {
      method: 'POST',
      body: payload,
      auth: false,
      retryOnUnauthorized: false,
    })
  }

  async expireSession() {
    this.options.setAccessToken(null)
    await this.rawRequest('/api/auth/logout', {
      method: 'POST',
      body: {},
      auth: false,
      retryOnUnauthorized: false,
    }).catch(() => undefined)
    await this.options.onAuthExpired?.()
  }

  // Dashboard

  getDashboard(): Promise<DashboardResponse> {
    return this.request('/api/dashboard', dashboardResponseSchema, { auth: true })
  }

  getAnalytics(): Promise<AnalyticsResponse> {
    return this.request('/api/dashboard/analytics', analyticsResponseSchema, { auth: true })
  }

  runHealthChecks(): Promise<HealthRunAllResponse> {
    return this.request('/api/health/run', healthRunAllResponseSchema, { method: 'POST', auth: true })
  }

  // Projects

  listProjects(): Promise<ProjectListResponse> {
    return this.request('/api/projects', projectListResponseSchema, { auth: true })
  }

  getProject(id: string): Promise<ProjectDetailResponse> {
    return this.request(`/api/projects/${id}`, projectDetailResponseSchema, { auth: true })
  }

  createProject(payload: ProjectCreatePayload): Promise<ProjectResponse> {
    return this.request('/api/projects', projectResponseSchema, { method: 'POST', body: payload, auth: true })
  }

  updateProject(id: string, payload: ProjectUpdatePayload): Promise<ProjectResponse> {
    return this.request(`/api/projects/${id}`, projectResponseSchema, { method: 'PATCH', body: payload, auth: true })
  }

  async deleteProject(id: string) {
    await this.rawRequest(`/api/projects/${id}`, { method: 'DELETE', auth: true })
  }

  checkProject(id: string): Promise<HealthCheckResponse> {
    return this.request(`/api/projects/${id}/check`, healthCheckResponseSchema, { method: 'POST', auth: true })
  }

  // Domains

  listDomains(): Promise<DomainListResponse> {
    return this.request('/api/domains', domainListResponseSchema, { auth: true })
  }

  createDomain(payload: DomainCreatePayload): Promise<DomainResponse> {
    return this.request('/api/domains', domainResponseSchema, { method: 'POST', body: payload, auth: true })
  }

  updateDomain(id: string, payload: DomainUpdatePayload): Promise<DomainResponse> {
    return this.request(`/api/domains/${id}`, domainResponseSchema, { method: 'PATCH', body: payload, auth: true })
  }

  async deleteDomain(id: string) {
    await this.rawRequest(`/api/domains/${id}`, { method: 'DELETE', auth: true })
  }

  syncDomains(): Promise<DomainSyncResponse> {
    return this.request('/api/domains/sync', domainSyncResponseSchema, { method: 'POST', auth: true })
  }

  // Servers

  listServers(): Promise<ServerListResponse> {
    return this.request('/api/servers', serverListResponseSchema, { auth: true })
  }

  getServer(id: string): Promise<ServerDetailResponse> {
    return this.request(`/api/servers/${id}`, serverDetailResponseSchema, { auth: true })
  }

  createServer(payload: ServerCreatePayload): Promise<ServerResponse> {
    return this.request('/api/servers', serverResponseSchema, { method: 'POST', body: payload, auth: true })
  }

  updateServer(id: string, payload: ServerUpdatePayload): Promise<ServerResponse> {
    return this.request(`/api/servers/${id}`, serverResponseSchema, { method: 'PATCH', body: payload, auth: true })
  }

  async deleteServer(id: string) {
    await this.rawRequest(`/api/servers/${id}`, { method: 'DELETE', auth: true })
  }

  recordServerPayment(id: string, payload: ServerPaymentCreatePayload): Promise<ServerDetailResponse> {
    return this.request(`/api/servers/${id}/payments`, serverDetailResponseSchema, {
      method: 'POST',
      body: payload,
      auth: true,
    })
  }

  deleteServerPayment(id: string, paymentId: string): Promise<ServerDetailResponse> {
    return this.request(`/api/servers/${id}/payments/${paymentId}`, serverDetailResponseSchema, {
      method: 'DELETE',
      auth: true,
    })
  }

  // Clients

  listClients(): Promise<ClientListResponse> {
    return this.request('/api/clients', clientListResponseSchema, { auth: true })
  }

  createClient(payload: ClientCreatePayload): Promise<ClientResponse> {
    return this.request('/api/clients', clientResponseSchema, { method: 'POST', body: payload, auth: true })
  }

  updateClient(id: string, payload: ClientUpdatePayload): Promise<ClientResponse> {
    return this.request(`/api/clients/${id}`, clientResponseSchema, { method: 'PATCH', body: payload, auth: true })
  }

  async deleteClient(id: string) {
    await this.rawRequest(`/api/clients/${id}`, { method: 'DELETE', auth: true })
  }

  // Invoices

  listInvoices(query: InvoiceListQuery = {}): Promise<InvoiceListResponse> {
    const search = new URLSearchParams()
    if (query.status) search.set('status', query.status)
    if (query.clientId) search.set('clientId', query.clientId)
    if (query.projectId) search.set('projectId', query.projectId)
    const suffix = search.size > 0 ? `?${search.toString()}` : ''
    return this.request(`/api/invoices${suffix}`, invoiceListResponseSchema, { auth: true })
  }

  createInvoice(payload: InvoiceCreatePayload): Promise<InvoiceResponse> {
    return this.request('/api/invoices', invoiceResponseSchema, { method: 'POST', body: payload, auth: true })
  }

  updateInvoice(id: string, payload: InvoiceUpdatePayload): Promise<InvoiceResponse> {
    return this.request(`/api/invoices/${id}`, invoiceResponseSchema, { method: 'PATCH', body: payload, auth: true })
  }

  async deleteInvoice(id: string) {
    await this.rawRequest(`/api/invoices/${id}`, { method: 'DELETE', auth: true })
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: RequestOptions,
  ): Promise<z.infer<TSchema>> {
    const response = await this.rawRequest(path, options)
    const data = await response.json()
    return schema.parse(data)
  }

  private async rawRequest(path: string, options: RequestOptions): Promise<Response> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: this.headers(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    if (response.status === 401 && options.auth && options.retryOnUnauthorized !== false) {
      const refreshed = await this.refreshOnce().catch(async (error: unknown) => {
        await this.expireSession()
        throw error
      })
      this.options.setAccessToken(refreshed.accessToken)
      return this.rawRequest(path, {
        ...options,
        accessTokenOverride: refreshed.accessToken,
        retryOnUnauthorized: false,
      })
    }

    if (!response.ok) {
      throw await toApiError(response)
    }

    return response
  }

  private refreshOnce() {
    this.refreshPromise ??= this.refresh().finally(() => {
      this.refreshPromise = null
    })

    return this.refreshPromise
  }

  private headers(options: RequestOptions) {
    const headers = new Headers({
      'X-Client-Platform': 'web',
    })

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    if (options.auth) {
      const accessToken = options.accessTokenOverride ?? this.options.getAccessToken()
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
      }
    }

    return headers
  }
}

async function toApiError(response: Response) {
  const fallbackMessage = `Запрос завершился с ошибкой ${response.status}`

  try {
    const parsed = apiErrorSchema.parse(await response.json())
    return new ApiRequestError(response.status, parsed.error.code, parsed.error.message)
  } catch {
    return new ApiRequestError(response.status, 'INTERNAL_ERROR', fallbackMessage)
  }
}
