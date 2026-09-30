import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClientCreatePayload,
  ClientUpdatePayload,
  DomainCreatePayload,
  DomainUpdatePayload,
  InvoiceCreatePayload,
  InvoiceListQuery,
  InvoiceUpdatePayload,
  JournalEntryCreatePayload,
  JournalEntryUpdatePayload,
  JournalListQuery,
  ProjectCreatePayload,
  ProjectUpdatePayload,
  ServerCreatePayload,
  ServerPaymentCreatePayload,
  ServerUpdatePayload,
  TaskCreatePayload,
  TaskListQuery,
  TaskUpdatePayload,
} from '@projects-hq/contracts'

import { useAuth } from './use-auth'

export const queryKeys = {
  authStatus: ['auth', 'status'] as const,
  dashboard: ['dashboard'] as const,
  analytics: ['dashboard', 'analytics'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  servers: ['servers'] as const,
  domains: ['domains'] as const,
  tags: ['tags'] as const,
  server: (id: string) => ['servers', id] as const,
  clients: ['clients'] as const,
  invoices: (query: InvoiceListQuery = {}) => ['invoices', query] as const,
  journal: (query: JournalListQuery = {}) => ['journal', query] as const,
  tasks: (query: TaskListQuery = {}) => ['tasks', query] as const,
}

/** Dashboard data feeds off every entity, so any write refreshes everything the panel shows. */
function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries()
}

export function useAuthStatus() {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.authStatus, queryFn: () => api.authStatus() })
}

export function useDashboard() {
  const { api } = useAuth()
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.getDashboard(),
    refetchInterval: 60_000,
  })
}

export function useAnalytics() {
  const { api } = useAuth()
  return useQuery({
    queryKey: queryKeys.analytics,
    queryFn: () => api.getAnalytics(),
    refetchInterval: 60_000,
  })
}

export function useProjects() {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.projects, queryFn: () => api.listProjects() })
}

export function useProject(id: string) {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.project(id), queryFn: () => api.getProject(id) })
}

export function useServers() {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.servers, queryFn: () => api.listServers() })
}

export function useTags() {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => api.listTags() })
}

export function useRenameTag() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) => api.renameTag(name, newName),
    onSuccess: invalidate,
  })
}

export function useDeleteTag() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (name: string) => api.deleteTag(name), onSuccess: invalidate })
}

export function useJournal(query: JournalListQuery = {}) {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.journal(query), queryFn: () => api.listJournal(query) })
}

export function useCreateJournalEntry() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (payload: JournalEntryCreatePayload) => api.createJournalEntry(payload),
    onSuccess: invalidate,
  })
}

export function useUpdateJournalEntry() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: JournalEntryUpdatePayload }) =>
      api.updateJournalEntry(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteJournalEntry() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteJournalEntry(id), onSuccess: invalidate })
}

export function useTasks(query: TaskListQuery = {}) {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.tasks(query), queryFn: () => api.listTasks(query) })
}

export function useCreateTask() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (payload: TaskCreatePayload) => api.createTask(payload), onSuccess: invalidate })
}

export function useUpdateTask() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TaskUpdatePayload }) => api.updateTask(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteTask(id), onSuccess: invalidate })
}

export function useDomains() {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.domains, queryFn: () => api.listDomains() })
}

export function useCreateDomain() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (payload: DomainCreatePayload) => api.createDomain(payload), onSuccess: invalidate })
}

export function useUpdateDomain() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DomainUpdatePayload }) => api.updateDomain(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteDomain() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteDomain(id), onSuccess: invalidate })
}

export function useSyncDomains() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: () => api.syncDomains(), onSuccess: invalidate })
}

export function useServer(id: string) {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.server(id), queryFn: () => api.getServer(id) })
}

export function useClients() {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.clients, queryFn: () => api.listClients() })
}

export function useInvoices(query: InvoiceListQuery = {}) {
  const { api } = useAuth()
  return useQuery({ queryKey: queryKeys.invoices(query), queryFn: () => api.listInvoices(query) })
}

export function useRunHealthChecks() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: () => api.runHealthChecks(), onSuccess: invalidate })
}

export function useCheckProject() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.checkProject(id), onSuccess: invalidate })
}

export function useCreateProject() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (payload: ProjectCreatePayload) => api.createProject(payload), onSuccess: invalidate })
}

export function useUpdateProject() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectUpdatePayload }) => api.updateProject(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteProject() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteProject(id), onSuccess: invalidate })
}

export function useCreateServer() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (payload: ServerCreatePayload) => api.createServer(payload), onSuccess: invalidate })
}

export function useUpdateServer() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ServerUpdatePayload }) => api.updateServer(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteServer() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteServer(id), onSuccess: invalidate })
}

export function useRecordServerPayment() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ServerPaymentCreatePayload }) =>
      api.recordServerPayment(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteServerPayment() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) => api.deleteServerPayment(id, paymentId),
    onSuccess: invalidate,
  })
}

export function useCreateClient() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (payload: ClientCreatePayload) => api.createClient(payload), onSuccess: invalidate })
}

export function useUpdateClient() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ClientUpdatePayload }) => api.updateClient(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteClient() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteClient(id), onSuccess: invalidate })
}

export function useCreateInvoice() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (payload: InvoiceCreatePayload) => api.createInvoice(payload), onSuccess: invalidate })
}

export function useUpdateInvoice() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InvoiceUpdatePayload }) => api.updateInvoice(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteInvoice() {
  const { api } = useAuth()
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => api.deleteInvoice(id), onSuccess: invalidate })
}
